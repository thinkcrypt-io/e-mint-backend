import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Automation, { ACTION_TYPES, AUTOMATION_EVENTS } from '../models/tenancy/automation.model.js';
import AutomationRun from '../models/tenancy/automationRun.model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import MailMessage from '../models/tenancy/mailMessage.model.js';
import { currentScope, runInScope } from './tenantScope.function.js';
import { scopedModel, displayModelName } from './routeRegistry.function.js';
import { REFERENCE_KINDS, displayFieldOf } from './dynamicModels.function.js';
import { LOCK_OPS, meets } from './fieldLocks.function.js';
import { TenancyError, projectPeople } from './tenancy.function.js';
import { notifyTenant, projectHrefFor } from './tenantNotify.function.js';
import { sendOrgMail, esc, para } from './mail.function.js';
import { designMail } from './mailDesign.function.js';
import MailDesign from '../models/tenancy/mailDesign.model.js';
import { PdfTemplate } from '../models/pdf-templates/_index.js';
import { normalizeTemplate } from './pdfTemplates/schema.js';
import { printRecords } from '../controllers/pdfTemplates/exportTemplate.controller.js';
import { resources, resolveOther } from '../controllers/builder/viewDocument.controller.js';
import { signWebhook, webhookUrlProblem, webhookRecord } from './webhooks.function.js';
import { recordHistory } from './recordHistory.function.js';

/**
 * Automations (docs/automations): after a record of a page is created,
 * changed or deleted, the project's automations on that page run in the
 * background — conditions first, then their actions in order: notify people,
 * send an email, call a webhook, update a record, create a record.
 *
 *   fireAutomations(…)     from recordHistory and the public router, beside fireWebhooks
 *   checkAutomation(…)     what the API saves: every reference resolved, or a 400 naming the field
 *   dryRun(…)              what each action would do on a record — nothing sent or written
 *
 * They act as the automation, not the person who saved (A2). Writes by actions
 * are ordinary saves: History, webhooks and further automations follow, up to
 * MAX_DEPTH deep, never the same automation on the same record twice (A6).
 */

export const MAX_DEPTH = 3;
export const MAX_ACTIONS = 10;
const RUNS_PER_HOUR = () => Number(process.env.AUTOMATION_RUNS_PER_HOUR) || 500;
const EMAILS_PER_DAY = () => Number(process.env.AUTOMATION_EMAILS_PER_DAY) || 300;
const MAX_TYPED_EMAILS = 10;
/** PDFs an email can attach — each printed for the record. */
const MAX_ATTACHMENTS = 3;
const MAX_TARGETS = 20;
const TIMEOUT_MS = 10_000;

const tenantUrl = () => String(process.env.TENANT_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/* ---------------------------------------------------------- the chain */

type Chain = { depth: number; seen: Set<string> };
const chain = new AsyncLocalStorage<Chain>();

/* ------------------------------------------------------------ errors */

/** A 400 that points at the input: `on` is the path in the automation ("actions.1.url"). */
const invalid = (message: string, on?: string) => {
	const e: any = new TenancyError(400, message, 'invalid_automation');
	if (on) e.extra = { on };
	return e;
};

/* ------------------------------------------------------------ helpers */

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));
const plainObj = (doc: any) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc ? { ...doc } : doc);
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_RX = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Fields an action may never write: system ones and calculated ones. */
const SYSTEM_FIELDS = new Set(['_id', 'id', 'createdAt', 'updatedAt', 'code', 'addedBy', 'access', 'privacy', 'organization', 'project', '_model', '__v']);
const UNWRITABLE_KINDS = new Set(['formula', 'section', 'sectionlist', 'component', 'blocks', 'password']);

const actionLabel: Record<string, string> = {
	notify: 'Notify people',
	email: 'Send an email',
	webhook: 'Call a webhook',
	update: 'Update a record',
	create: 'Create a record',
};

type Def = { name: string; route: string; title?: string; fields: any[]; displayField?: string; code?: any };

/** A page's model definition and model, in the current project. */
const pageOf = async (route: string): Promise<{ def: Def; Model: mongoose.Model<any> } | null> => {
	const def: any = await ModelDefinition.findOne({ route }).lean();
	const Model = def && scopedModel(def.name);
	return def && Model ? { def, Model } : null;
};

const nounOf = (def: Def) => (def.title ? String(def.title).replace(/s$/i, '') : displayModelName(def.name));

/** The name a record goes by: its display field. */
const recordName = (def: Def, doc: any) => {
	const f = displayFieldOf(def as any);
	const v = f && f !== '_id' ? doc?.[f] : '';
	return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
};

/* -------------------------------------------------------- placeholders */

type Ctx = {
	def: Def;
	doc: any;
	event: string;
	actorName: string;
	project: any;
	link: string;
	/** Names of referenced records, loaded once per run. */
	refNames: Map<string, string>;
};

/** A value as text: a date by its day, a list joined, a reference by its record's name. */
const show = (ctx: Ctx, key: string, value: any): string => {
	if (value === undefined || value === null) return '';
	const field = ctx.def.fields.find((f: any) => f.key === key);
	if (field && REFERENCE_KINDS.includes(field.kind)) {
		const ids = (Array.isArray(value) ? value : [value]).map(v => String(v?._id || v));
		return ids.map(id => ctx.refNames.get(id) || id).join(', ');
	}
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (field?.kind === 'date' && value) return new Date(value).toISOString().slice(0, 10);
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (Array.isArray(value)) return value.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
};

/** Loads the names of the records the text's reference placeholders name. */
const loadRefNames = async (ctx: Ctx, texts: string[]) => {
	const keys = new Set<string>();
	for (const t of texts) for (const m of String(t || '').matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) keys.add(m[1]);
	for (const key of keys) {
		const field = ctx.def.fields.find((f: any) => f.key === key && REFERENCE_KINDS.includes(f.kind));
		if (!field?.ref) continue;
		const Ref = scopedModel(String(field.ref));
		const refDef: any = Ref && (await ModelDefinition.findOne({ name: displayModelName(String(field.ref)) }).lean());
		const raw = ctx.doc?.[key];
		const ids = (Array.isArray(raw) ? raw : [raw]).map(v => String(v?._id || v || '')).filter(isId).slice(0, MAX_TARGETS);
		if (!Ref || !ids.length) continue;
		const docs: any[] = await Ref.find({ _id: { $in: ids } }).lean();
		for (const d of docs) ctx.refNames.set(String(d._id), (refDef && recordName(refDef, d)) || String(d.name || d.title || d.code || d._id));
	}
};

/** `{{field}}`, `{{link}}`, `{{page}}`, `{{project}}`, `{{actor}}`, `{{event}}`, `{{today}}` → their values. */
export const fill = (ctx: Ctx, text: any): string =>
	String(text ?? '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, key: string) => {
		switch (key) {
			case 'link':
				return ctx.link;
			case 'page':
				return nounOf(ctx.def);
			case 'project':
				return ctx.project?.name || '';
			case 'actor':
				return ctx.actorName;
			case 'event':
				return ctx.event === 'create' ? 'created' : ctx.event === 'update' ? 'changed' : 'deleted';
			case 'today':
				return new Date().toISOString().slice(0, 10);
			default:
				return show(ctx, key, ctx.doc?.[key]);
		}
	});

/* ------------------------------------------------------------ checking */

const PLACEHOLDER_KEYS = new Set(['link', 'page', 'project', 'actor', 'event', 'today']);

/** Unknown `{{names}}` in a text: refused at save, so a typo shows at once. */
const checkText = (def: Def, text: string, on: string, label: string) => {
	for (const m of String(text || '').matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
		const key = m[1];
		if (!PLACEHOLDER_KEYS.has(key) && !def.fields.some((f: any) => f.key === key))
			throw invalid(`${label}: {{${key}}} isn’t a field of this page. Use a field’s key, or {{link}}, {{page}}, {{project}}, {{actor}}, {{event}}, {{today}}.`, on);
	}
};

const writableField = (def: Def, key: string) => {
	const f = def.fields.find((x: any) => x.key === key);
	return f && !SYSTEM_FIELDS.has(key) && !UNWRITABLE_KINDS.has(f.kind) ? f : null;
};

/** One assignment list (`set`) of an update or create action, against the target page. */
const checkSet = (source: Def, target: Def, set: any, on: string, label: string) => {
	if (!Array.isArray(set) || !set.length) throw invalid(`${label}: choose at least one field to set`, on);
	if (set.length > 30) throw invalid(`${label}: at most 30 fields`, on);
	const seen = new Set<string>();
	return set.map((s: any, i: number) => {
		const at = `${on}.${i}`;
		const f = writableField(target, String(s?.field || ''));
		if (!f) throw invalid(`${label}: choose a field of ${nounOf(target)} that can be changed`, `${at}.field`);
		if (seen.has(f.key)) throw invalid(`${label}: ${f.label || f.key} is set twice`, `${at}.field`);
		seen.add(f.key);
		if (s.clear) return { field: f.key, clear: true };
		if (s.from !== undefined && s.from !== null && s.from !== '') {
			// `_id`: the record itself — a new Task linked back to the Deal that made it.
			if (s.from !== '_id' && !source.fields.some((x: any) => x.key === s.from)) throw invalid(`${label}: copy from a field of ${nounOf(source)}`, `${at}.from`);
			return { field: f.key, from: String(s.from) };
		}
		if (typeof s.value === 'string') checkText(source, s.value, `${at}.value`, label);
		return { field: f.key, value: s.value ?? '' };
	});
};

const checkPeople = async (ids: any, on: string, label: string) => {
	if (ids === undefined) return [];
	if (!Array.isArray(ids)) throw invalid(`${label}: choose people from the project`, on);
	const clean = [...new Set(ids.map(String))].filter(isId);
	if (!clean.length) return [];
	const members = new Set((await projectPeople()).map((p: any) => String(p._id)));
	const outside = clean.filter(id => !members.has(id));
	if (outside.length) throw invalid(`${label}: only people in this project can be chosen`, on);
	return clean;
};

/** Kinds an address can be read from. */
const ADDRESS_KINDS = ['email', 'text'];

/**
 * Where an email's address is read from: a field of the record ("email"), or
 * a field of a record it links to ("customer.email" — a bill's customer).
 */
const checkAddressField = async (def: Def, path: string, on: string, label: string) => {
	const [key, sub, ...rest] = path.split('.');
	const f = def.fields.find((x: any) => x.key === key);
	if (!sub) {
		if (!f || !ADDRESS_KINDS.includes(f.kind)) throw invalid(`${label}: “${path}” isn’t an email field of ${nounOf(def)}`, on);
		return;
	}
	if (rest.length || !f || !REFERENCE_KINDS.includes(f.kind) || !f.ref) throw invalid(`${label}: “${key}” isn’t a linked record of ${nounOf(def)}`, on);
	const refDef: any = await ModelDefinition.findOne({ name: displayModelName(String(f.ref)) }).lean();
	if (!refDef) throw invalid(`${label}: the page “${f.label || f.key}” links to is gone`, on);
	if (!refDef.fields?.some((x: any) => x.key === sub && ADDRESS_KINDS.includes(x.kind)))
		throw invalid(`${label}: “${sub}” isn’t an email field of ${nounOf(refDef)}`, on);
};

/**
 * An automation as the API saves it: the page, events, fields, conditions and
 * every action checked against the project — or a 400 that names the input.
 */
export const checkAutomation = async (body: any) => {
	const name = String(body?.name || '').trim();
	if (!name) throw invalid('Name the automation', 'name');
	if (name.length > 80) throw invalid('A name is at most 80 characters', 'name');
	const route = String(body?.route || '').toLowerCase();
	const page = route ? await pageOf(route) : null;
	if (!page) throw invalid('Choose the page whose records start it', 'route');
	const { def } = page;

	const on = [...new Set<string>((Array.isArray(body.on) ? body.on : []).map(String))].filter(e => (AUTOMATION_EVENTS as readonly string[]).includes(e));
	if (!on.length) throw invalid('Choose when it runs: created, changed or deleted', 'on');

	const changed = [...new Set<string>((Array.isArray(body.changed) ? body.changed : []).map(String))];
	for (const c of changed) if (!def.fields.some((f: any) => f.key === c)) throw invalid(`“${c}” isn’t a field of ${nounOf(def)}`, 'changed');

	const when = (Array.isArray(body.when) ? body.when : []).map((c: any, i: number) => {
		if (!c?.field || !def.fields.some((f: any) => f.key === c.field) && !['createdAt', 'updatedAt', 'code'].includes(c.field))
			throw invalid(`Condition ${i + 1}: choose a field of ${nounOf(def)}`, `when.${i}.field`);
		if (!(LOCK_OPS as readonly string[]).includes(c.op)) throw invalid(`Condition ${i + 1}: choose how to compare`, `when.${i}.op`);
		return { field: String(c.field), op: c.op, ...(c.value !== undefined && { value: c.value }) };
	});
	if (when.length > 20) throw invalid('At most 20 conditions', 'when');

	const actionsIn = Array.isArray(body.actions) ? body.actions : [];
	if (!actionsIn.length) throw invalid('Add at least one action', 'actions');
	if (actionsIn.length > MAX_ACTIONS) throw invalid(`At most ${MAX_ACTIONS} actions`, 'actions');

	const actions: any[] = [];
	for (let i = 0; i < actionsIn.length; i++) {
		const a = actionsIn[i] || {};
		const at = `actions.${i}`;
		const label = `Action ${i + 1} (${actionLabel[a.type] || 'unknown'})`;
		if (!(ACTION_TYPES as readonly string[]).includes(a.type)) throw invalid(`Action ${i + 1}: choose what it does`, `${at}.type`);

		if (a.type === 'notify') {
			const people = await checkPeople(a.to?.people, `${at}.to.people`, label);
			const actor = !!a.to?.actor;
			if (!people.length && !actor) throw invalid(`${label}: choose who to notify`, `${at}.to`);
			const title = String(a.title || '').trim();
			if (!title) throw invalid(`${label}: write the notification’s title`, `${at}.title`);
			checkText(def, title, `${at}.title`, label);
			checkText(def, a.message || '', `${at}.message`, label);
			actions.push({ type: 'notify', to: { people, actor }, title: title.slice(0, 200), message: String(a.message || '').slice(0, 1000) });
		} else if (a.type === 'email') {
			const people = await checkPeople(a.to?.people, `${at}.to.people`, label);
			const actor = !!a.to?.actor;
			const fields = [...new Set<string>((Array.isArray(a.to?.fields) ? a.to.fields : []).map(String))];
			for (const f of fields) await checkAddressField(def, f, `${at}.to.fields`, label);
			const emails = [...new Set<string>((Array.isArray(a.to?.emails) ? a.to.emails : []).map((e: any) => String(e).trim().toLowerCase()).filter(Boolean))];
			if (emails.length > MAX_TYPED_EMAILS) throw invalid(`${label}: at most ${MAX_TYPED_EMAILS} addresses`, `${at}.to.emails`);
			const bad = emails.find(e => !EMAIL_RX.test(e));
			if (bad) throw invalid(`${label}: “${bad}” isn’t an email address`, `${at}.to.emails`);
			if (!people.length && !actor && !fields.length && !emails.length) throw invalid(`${label}: choose who gets it`, `${at}.to`);
			const subject = String(a.subject || '').trim();
			const text = String(a.body || '').trim();
			if (!subject) throw invalid(`${label}: write a subject`, `${at}.subject`);
			if (!text) throw invalid(`${label}: write the message`, `${at}.body`);
			checkText(def, subject, `${at}.subject`, label);
			checkText(def, text, `${at}.body`, label);
			// The design it goes out in: one of the project's, or (none) the project's default.
			let design: string | undefined;
			if (a.design) {
				if (!isId(a.design) || !(await MailDesign.exists({ _id: a.design, project: currentScope()?.project })))
					throw invalid(`${label}: that email design is gone — choose another`, `${at}.design`);
				design = String(a.design);
			}
			// PDFs printed for the record and attached — the page's published templates (an invoice for a bill).
			const attach = [...new Set<string>((Array.isArray(a.attach) ? a.attach : []).map(String))];
			if (attach.length > MAX_ATTACHMENTS) throw invalid(`${label}: at most ${MAX_ATTACHMENTS} PDFs`, `${at}.attach`);
			if (attach.length && on.length === 1 && on[0] === 'delete') throw invalid(`${label}: a deleted record can’t be printed — attach PDFs when it’s created or changed`, `${at}.attach`);
			for (const id of attach) {
				const t: any = isId(id) ? await PdfTemplate.findOne({ _id: id }, { route: 1, status: 1, name: 1 }).lean() : null;
				if (!t || t.route !== def.route) throw invalid(`${label}: choose a PDF template of ${nounOf(def)}`, `${at}.attach`);
				if (t.status === 'draft') throw invalid(`${label}: “${t.name}” is a draft — publish it to attach it`, `${at}.attach`);
			}
			actions.push({ type: 'email', to: { people, actor, fields, emails }, subject: subject.slice(0, 200), body: text.slice(0, 10000), ...(design && { design }), ...(attach.length && { attach }) });
		} else if (a.type === 'webhook') {
			const url = String(a.url || '').trim();
			if (!/^https?:\/\//i.test(url)) throw invalid(`${label}: an address starting with https://`, `${at}.url`);
			const problem = await webhookUrlProblem(url);
			if (problem) throw invalid(`${label}: ${problem}`, `${at}.url`);
			actions.push({ type: 'webhook', url: url.slice(0, 2000) });
		} else if (a.type === 'update') {
			const target = String(a.target || 'this');
			let targetDef: Def = def;
			if (target !== 'this') {
				const f = def.fields.find((x: any) => x.key === target && REFERENCE_KINDS.includes(x.kind));
				if (!f?.ref) throw invalid(`${label}: choose this record, or a linked record picked in one of its fields`, `${at}.target`);
				const refDef: any = await ModelDefinition.findOne({ name: displayModelName(String(f.ref)) }).lean();
				if (!refDef) throw invalid(`${label}: the page “${f.label || f.key}” links to is gone`, `${at}.target`);
				targetDef = refDef;
			} else if (on.length === 1 && on[0] === 'delete') throw invalid(`${label}: a deleted record can’t be updated — choose a linked record`, `${at}.target`);
			actions.push({ type: 'update', target, set: checkSet(def, targetDef, a.set, `${at}.set`, label) });
		} else if (a.type === 'create') {
			const r = String(a.route || '').toLowerCase();
			const p = r ? await pageOf(r) : null;
			if (!p) throw invalid(`${label}: choose the page to add a record to`, `${at}.route`);
			const set = checkSet(def, p.def, a.set, `${at}.set`, label);
			const missing = p.def.fields.filter((f: any) => f.required && !UNWRITABLE_KINDS.has(f.kind) && f.default === undefined && !set.some((s: any) => s.field === f.key));
			if (missing.length) throw invalid(`${label}: also set ${missing.map((f: any) => f.label || f.key).join(', ')} — ${nounOf(p.def)} needs ${missing.length === 1 ? 'it' : 'them'}`, `${at}.set`);
			actions.push({ type: 'create', route: r, set });
		}
	}

	return {
		name,
		description: String(body.description || '').trim().slice(0, 300),
		enabled: body.enabled !== false,
		route,
		on,
		changed: on.includes('update') ? changed : [],
		when,
		match: body.match === 'any' ? 'any' : 'all',
		actions,
	};
};

/** The addresses in `path` of the record: its own field, or that field of each linked record. */
const addressesAt = async (ctx: Ctx, path: string): Promise<string[]> => {
	const [key, sub] = path.split('.');
	const raw = ctx.doc?.[key];
	if (!sub) return [String(raw || '')];
	const f = ctx.def.fields.find((x: any) => x.key === key);
	const refDef: any = f?.ref && (await ModelDefinition.findOne({ name: displayModelName(String(f.ref)) }).lean());
	const M = refDef && scopedModel(refDef.name);
	if (!M) return [];
	const ids = (Array.isArray(raw) ? raw : [raw]).map(v => String(v?._id || v || '')).filter(isId).slice(0, MAX_TARGETS);
	if (!ids.length) return [];
	const docs: any[] = await M.find({ _id: { $in: ids } }, { [sub]: 1 }).lean();
	return docs.map(d => String(d?.[sub] || ''));
};

/* ------------------------------------------------------------- actions */

type RunArgs = { automation: any; def: Def; Model: mongoose.Model<any>; doc: any; event: string; actor?: any; dry?: boolean };
type Step = { type: string; ok: boolean; detail: string };

/** A write by an action: what History and the next automations see as the person. */
const actingReq = (automation: any) => ({ user: { _id: undefined, name: `Automation “${automation.name}”` } });

const valueOf = (ctx: Ctx, s: any) => (s.clear ? undefined : s.from ? ctx.doc?.[s.from] : typeof s.value === 'string' ? fill(ctx, s.value) : s.value);

const recipientsOf = async (ctx: Ctx, to: any, actor: any, withEmails: boolean) => {
	const people = to?.people?.length ? await projectPeople() : [];
	const picked = people.filter((p: any) => to.people.map(String).includes(String(p._id)));
	const users = new Map<string, { _id: string; email?: string; name?: string }>();
	for (const p of picked) users.set(String(p._id), { _id: String(p._id), email: p.email, name: p.name });
	if (to?.actor && actor?._id && isId(actor._id)) users.set(String(actor._id), { _id: String(actor._id), email: actor.email, name: actor.name });
	if (!withEmails) return { users: [...users.values()], emails: [] as string[] };
	const emails = new Set<string>();
	for (const u of users.values()) if (u.email) emails.add(String(u.email).toLowerCase());
	for (const f of to?.fields || [])
		for (const raw of await addressesAt(ctx, String(f))) {
			const v = raw.trim().toLowerCase();
			if (EMAIL_RX.test(v)) emails.add(v);
		}
	for (const e of to?.emails || []) emails.add(String(e).toLowerCase());
	return { users: [...users.values()], emails: [...emails] };
};

const doNotify = async (ctx: Ctx, a: any, args: RunArgs): Promise<Step> => {
	const { users } = await recipientsOf(ctx, a.to, args.actor, false);
	const title = fill(ctx, a.title).slice(0, 200);
	const message = fill(ctx, a.message || '').slice(0, 500);
	if (!users.length) return { type: 'notify', ok: true, detail: 'No one to notify' };
	if (args.dry) return { type: 'notify', ok: true, detail: `Would notify ${users.map(u => u.name || u.email).join(', ')}: “${title}”` };
	const scope = currentScope()!;
	const href = ctx.event === 'delete' ? await projectHrefFor(ctx.project, `/${ctx.def.route}`) : await projectHrefFor(ctx.project, `/${ctx.def.route}/${ctx.doc._id}`);
	// Automations notify whoever was chosen — the person who saved too, unlike a person's own actions.
	await notifyTenant(
		users.map(u => ({
			recipient: u._id,
			organization: scope.organization,
			project: scope.project,
			actorName: `Automation “${args.automation.name}”`,
			type: 'automation',
			title,
			message,
			href,
			route: ctx.def.route,
			record: ctx.event === 'delete' ? undefined : ctx.doc._id,
		}))
	);
	return { type: 'notify', ok: true, detail: `Notified ${users.map(u => u.name || u.email).join(', ')}` };
};

/**
 * The PDFs an email attaches, printed for the record as the page's download
 * prints them — as the automation's maker (record access), with every page's
 * lists. A template that's gone or back to draft stops the email: better no
 * email than one without its invoice.
 */
const attachmentsOf = async (ctx: Ctx, a: any, args: RunArgs) => {
	if (!a.attach?.length) return [];
	if (args.event === 'delete') throw new Error('The record was deleted — it can’t be printed');
	const entry = resources(null).get(ctx.def.route);
	const routeSettings = entry ? (await resolveOther(entry)).settings || {} : {};
	const req = { app: null, user: { _id: args.automation.createdBy }, permissions: ['*'] };
	const out: { filename: string; content: Buffer; contentType: string }[] = [];
	for (const id of a.attach) {
		const raw: any = await PdfTemplate.findOne({ _id: id }).lean();
		if (!raw || raw.route !== ctx.def.route) throw new Error('A PDF it attaches is gone — choose another in the automation');
		if (raw.status === 'draft') throw new Error(`The PDF “${raw.name}” is a draft — publish it to attach it`);
		const { template } = normalizeTemplate({ name: 'Document', ...raw });
		const printed: any = await printRecords({ req, Model: args.Model, template, ids: [String(ctx.doc._id)], routeSettings });
		if (!printed?.pdf) throw new Error('The record is gone — nothing to print');
		out.push({ filename: printed.file.replace(/[\\/:*?"<>|]+/g, '-'), content: printed.pdf, contentType: 'application/pdf' });
	}
	return out;
};

const doEmail = async (ctx: Ctx, a: any, args: RunArgs): Promise<Step> => {
	const { emails } = await recipientsOf(ctx, a.to, args.actor, true);
	const subject = fill(ctx, a.subject).slice(0, 200);
	const text = fill(ctx, a.body);
	if (!emails.length) return { type: 'email', ok: true, detail: 'No address to send to (the chosen email fields were empty)' };
	const attachments = await attachmentsOf(ctx, a, args);
	const files = attachments.length ? ` with ${attachments.map(f => f.filename).join(', ')}` : '';
	if (args.dry) return { type: 'email', ok: true, detail: `Would email ${emails.join(', ')}: “${subject}”${files}` };
	const scope = currentScope()!;
	const since = new Date(Date.now() - 24 * 3600 * 1000);
	const sent = await MailMessage.countDocuments({ project: scope.project, kind: 'automation', createdAt: { $gte: since } });
	if (sent + emails.length > EMAILS_PER_DAY()) throw new Error(`This project sent its ${EMAILS_PER_DAY()} automation emails for today — try again tomorrow`);
	const paragraphs = text
		.split(/\n{2,}/)
		.map(p => para(esc(p).replace(/\n/g, '<br>')))
		.join('');
	// Sent to people in the project (not to typed or record addresses): a button to the record.
	const toTeam = ctx.link && !a.to?.emails?.length && !a.to?.fields?.length;
	const html = await designMail(ctx.project, { heading: esc(subject), body: paragraphs, ...(toTeam ? { button: { href: ctx.link, text: `Open in ${ctx.project?.name || 'MINT'}` } } : {}) }, a.design);
	for (const to of emails) await sendOrgMail({ to, subject, text, html, attachments }, { organization: scope.organization, project: scope.project, kind: 'automation' });
	return { type: 'email', ok: true, detail: `Emailed ${emails.join(', ')}${files}` };
};

const doWebhook = async (ctx: Ctx, a: any, args: RunArgs): Promise<Step> => {
	const payload = {
		event: args.event,
		automation: { id: String(args.automation._id), name: args.automation.name },
		route: ctx.def.route,
		project: { id: String(ctx.project?._id || ''), slug: ctx.project?.publicSlug || '', name: ctx.project?.name || '' },
		at: new Date().toISOString(),
		record: webhookRecord(ctx.def, ctx.doc),
	};
	if (args.dry) return { type: 'webhook', ok: true, detail: `Would POST to ${a.url}` };
	const problem = await webhookUrlProblem(a.url);
	if (problem) throw new Error(problem);
	const body = JSON.stringify(payload);
	const timestamp = Math.floor(Date.now() / 1000);
	let res: Response;
	try {
		res = await fetch(a.url, {
			method: 'POST',
			redirect: 'manual',
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: {
				'content-type': 'application/json',
				'user-agent': 'e-mint-automations/1',
				'x-mint-event': `automation.${args.event}`,
				'x-mint-timestamp': String(timestamp),
				'x-mint-signature': signWebhook(args.automation.secret || '', timestamp, body),
			},
			body,
		});
	} catch (e: any) {
		throw new Error(e?.name === 'TimeoutError' ? `${a.url} didn’t answer in ${TIMEOUT_MS / 1000} seconds` : `Couldn’t reach ${a.url}: ${e?.cause?.code || e?.message}`);
	}
	if (res.status < 200 || res.status >= 300) throw new Error(`${a.url} answered ${res.status}`);
	return { type: 'webhook', ok: true, detail: `POST ${a.url} → ${res.status}` };
};

/** Each changed field for History: label, before, after. */
const changesOf = (def: Def, before: any, after: any, fields: string[]) =>
	fields
		.filter(k => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null))
		.map(k => {
			const f = def.fields.find((x: any) => x.key === k);
			const s = (v: any) => (v === undefined || v === null || v === '' ? '(empty)' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? JSON.stringify(v) : String(v));
			return { field: k, label: f?.label || k, from: s(before?.[k]), to: s(after?.[k]) };
		});

const doUpdate = async (ctx: Ctx, a: any, args: RunArgs): Promise<Step> => {
	let targetDef: Def = ctx.def;
	let Target: mongoose.Model<any> = args.Model;
	let ids: string[] = [];
	if (a.target === 'this') {
		if (args.event === 'delete') throw new Error('The record was deleted — there’s nothing to update');
		ids = [String(ctx.doc._id)];
	} else {
		const f = ctx.def.fields.find((x: any) => x.key === a.target);
		const refDef: any = f?.ref && (await ModelDefinition.findOne({ name: displayModelName(String(f.ref)) }).lean());
		const M = refDef && scopedModel(refDef.name);
		if (!refDef || !M) throw new Error(`The page ${f?.label || a.target} links to is gone`);
		targetDef = refDef;
		Target = M;
		const raw = ctx.doc?.[a.target];
		ids = (Array.isArray(raw) ? raw : [raw]).map(v => String(v?._id || v || '')).filter(isId).slice(0, MAX_TARGETS);
		if (!ids.length) return { type: 'update', ok: true, detail: `No ${nounOf(refDef)} picked — nothing to update` };
	}
	const values = a.set.map((s: any) => ({ field: s.field, value: valueOf(ctx, s), clear: !!s.clear }));
	const what = values.map((v: any) => `${targetDef.fields.find((f: any) => f.key === v.field)?.label || v.field} → ${v.clear ? '(empty)' : show({ ...ctx, def: targetDef }, v.field, v.value) || '(empty)'}`).join(', ');
	if (args.dry) return { type: 'update', ok: true, detail: `Would update ${ids.length} ${nounOf(targetDef)}: ${what}` };
	let done = 0;
	for (const id of ids) {
		const doc: any = await Target.findById(id);
		if (!doc) continue;
		const before = doc.toObject();
		for (const v of values) doc.set(v.field, v.clear ? undefined : v.value);
		await doc.save();
		done++;
		const changes = changesOf(targetDef, before, doc.toObject(), values.map((v: any) => v.field));
		recordHistory({ req: actingReq(args.automation), action: 'update', model: Target.modelName, doc, changes, modelPath: targetDef.route });
	}
	return { type: 'update', ok: true, detail: `Updated ${done} ${nounOf(targetDef)}: ${what}` };
};

const doCreate = async (ctx: Ctx, a: any, args: RunArgs): Promise<Step> => {
	const page = await pageOf(a.route);
	if (!page) throw new Error('The page to add a record to is gone');
	const data: any = {};
	for (const s of a.set) data[s.field] = valueOf(ctx, s);
	// A page with per-record access: the new record is its automation's maker's.
	if (page.Model.schema.path('addedBy') && args.automation.createdBy) data.addedBy = args.automation.createdBy;
	if (args.dry) return { type: 'create', ok: true, detail: `Would add a ${nounOf(page.def)}: ${Object.entries(data).filter(([k]) => k !== 'addedBy').map(([k, v]) => `${k} = ${show({ ...ctx, def: page.def }, k, v) || '(empty)'}`).join(', ')}` };
	const doc: any = await page.Model.create(data);
	recordHistory({ req: actingReq(args.automation), action: 'create', model: page.Model.modelName, doc, modelPath: page.def.route });
	return { type: 'create', ok: true, detail: `Added ${nounOf(page.def)} ${recordName(page.def, doc) || doc.code || doc._id}` };
};

const RUNNERS: Record<string, (ctx: Ctx, a: any, args: RunArgs) => Promise<Step>> = {
	notify: doNotify,
	email: doEmail,
	webhook: doWebhook,
	update: doUpdate,
	create: doCreate,
};

/** One automation on one record: every action in order, stopping at the first failure (A5). */
const runOne = async (args: RunArgs): Promise<{ status: 'success' | 'failed'; steps: Step[]; error?: string }> => {
	const project: any = await TenantProject.findById(currentScope()?.project, { name: 1, publicSlug: 1, organization: 1, business: 1 }).lean();
	const ctx: Ctx = {
		def: args.def,
		doc: args.doc,
		event: args.event,
		actorName: args.actor?.name || 'Someone',
		project,
		link: args.event === 'delete' || !project ? '' : `${tenantUrl()}/${project.publicSlug}/${args.def.route}/${args.doc._id}`,
		refNames: new Map(),
	};
	const texts = args.automation.actions.flatMap((a: any) => [a.title, a.message, a.subject, a.body, ...(a.set || []).map((s: any) => s.value)]).filter((t: any) => typeof t === 'string');
	await loadRefNames(ctx, texts);
	const steps: Step[] = [];
	for (const a of args.automation.actions) {
		try {
			steps.push(await RUNNERS[a.type](ctx, a, args));
		} catch (e: any) {
			const error = e?.message || 'Something went wrong';
			steps.push({ type: a.type, ok: false, detail: error });
			return { status: 'failed', steps, error: `${actionLabel[a.type]}: ${error}` };
		}
	}
	return { status: 'success', steps };
};

/* -------------------------------------------------------------- firing */

/** Whether an automation starts on this event: the changed fields, then the conditions. */
export const startsOn = (automation: any, event: string, doc: any, changes?: { field: string }[]) => {
	if (!automation.on?.includes(event)) return false;
	if (event === 'update' && automation.changed?.length && changes) {
		const touched = new Set(changes.map(c => String(c.field).split('.')[0]));
		if (!automation.changed.some((f: string) => touched.has(f))) return false;
	}
	return !automation.when?.length || meets(doc, automation.when, automation.match || 'all');
};

const finishRun = async (automation: any, run: any) => {
	await AutomationRun.create(run);
	await Automation.updateOne(
		{ _id: automation._id },
		{
			$inc: { 'stats.runs': run.status === 'skipped' ? 0 : 1, 'stats.failures': run.status === 'failed' ? 1 : 0 },
			$set: { 'stats.lastRunAt': new Date(), 'stats.lastStatus': run.status, 'stats.lastError': run.error || '' },
		}
	);
};

/**
 * After a record of a page was created, changed or deleted: its project's
 * automations on that page run — after the response, never failing the save.
 * Name the page by `route`, or the model by the name it was compiled under.
 */
export const fireAutomations = ({
	route,
	model,
	event,
	doc,
	changes,
	actor,
}: {
	route?: string;
	model?: string;
	event: string;
	doc: any;
	changes?: { field: string }[];
	actor?: { _id?: any; name?: string; email?: string };
}) => {
	// Nothing here may fail the save that called it: the work happens later, and every error ends in Runs (or the log).
	let scope: any, snapshot: any, from: Chain | undefined;
	try {
		scope = currentScope();
		if (!scope?.project || !(AUTOMATION_EVENTS as readonly string[]).includes(event) || !doc?._id) return;
		snapshot = plainObj(doc);
		from = chain.getStore();
	} catch (e: any) {
		console.error('automations:', e?.message);
		return;
	}
	setImmediate(() =>
		runInScope(scope, async () => {
			const name = model ? displayModelName(String(model)) : undefined;
			const def: any = await ModelDefinition.findOne(route ? { route } : { name }).lean();
			if (!def) return;
			const list: any[] = await Automation.find({ route: def.route, enabled: true, on: event }).select('+secret').lean();
			if (!list.length) return;
			const Model = scopedModel(def.name);
			if (!Model) return;
			const depth = (from?.depth || 0) + 1;
			for (const automation of list) {
				const key = `${automation._id}:${snapshot._id}`;
				if (from?.seen.has(key)) continue;
				const base = {
					automation: automation._id,
					name: automation.name,
					route: def.route,
					record: snapshot._id,
					recordName: recordName(def, snapshot),
					event,
					depth,
					actorName: actor?.name || '',
				};
				// One automation going wrong — anywhere, not only in an action — is its own failed run; the rest still run.
				try {
					if (!startsOn(automation, event, snapshot, changes)) continue;
					if (depth > MAX_DEPTH) {
						await finishRun(automation, { ...base, status: 'skipped', error: `Stopped: started by a chain of ${MAX_DEPTH} automations — more could loop forever` });
						continue;
					}
					const hour = await AutomationRun.countDocuments({ createdAt: { $gte: new Date(Date.now() - 3600 * 1000) }, status: { $ne: 'skipped' } });
					if (hour >= RUNS_PER_HOUR()) {
						await Automation.updateOne({ _id: automation._id }, { $set: { 'stats.lastStatus': 'skipped', 'stats.lastError': `Skipped: the project ran ${RUNS_PER_HOUR()} automations in the last hour` } });
						continue;
					}
					const seen = new Set(from?.seen || []);
					seen.add(key);
					const result = await chain.run({ depth, seen }, () => runOne({ automation, def, Model, doc: snapshot, event, actor }));
					await finishRun(automation, { ...base, ...result });
				} catch (e: any) {
					const error = `Couldn’t run: ${e?.message || 'something went wrong'}`;
					await finishRun(automation, { ...base, status: 'failed', steps: [], error }).catch((e2: any) => console.error('automations:', error, e2?.message));
				}
			}
		}).catch((e: any) => console.error('automations:', e?.message))
	);
};

/** "Run on a record": what each action would do — nothing sent or written (A10). */
export const dryRun = async (automation: any, recordId: string, event = 'update') => {
	const page = await pageOf(automation.route);
	if (!page) throw new TenancyError(404, 'Its page is gone');
	if (!isId(recordId)) throw new TenancyError(400, 'Choose a record');
	const doc: any = await page.Model.findById(recordId).lean();
	if (!doc) throw new TenancyError(404, 'Record not found');
	const ev = automation.on?.includes(event) ? event : automation.on?.[0] || 'update';
	const conditions = !automation.when?.length || meets(doc, automation.when, automation.match || 'all');
	const result = await runOne({ automation, def: page.def, Model: page.Model, doc, event: ev, dry: true, actor: undefined });
	return { record: { _id: String(doc._id), name: recordName(page.def, doc) }, event: ev, conditions, ...result };
};

export const newAutomationSecret = () => `whsec_${crypto.randomBytes(24).toString('hex')}`;
