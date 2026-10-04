import mongoose from 'mongoose';
import { runInScope } from '../../functions/tenantScope.function.js';
import { WEBSITE_KIT } from '../../functions/websiteKit.function.js';
import { ORG_PERMISSION_KEYS, SYSTEM_ROLE_DEFAULTS } from '../../functions/tenantPermissions.function.js';
import { planFeature, TEMPLATE_MAX_STEPS, CreateStep } from '../builder/features.service.js';
import { planFromAi } from '../builder/features.schema.js';
import { PUBLIC_API } from '../builder/models.controller.js';
import { defaultOf, enumOf } from '../../functions/dynamicModels.function.js';
import { normalizeWidget } from '../dashboard/dashboard.controller.js';
import {
	BLOCK_CATEGORIES,
	BUILTIN_PLACEHOLDERS,
	Part,
	PUBLIC_ACTIONS,
	TemplateType,
	WEBHOOK_EVENTS,
	placeholdersUsed,
	relativeDate,
	stepIdentity,
} from './blueprint.js';

/**
 * Checks a template's blueprint without building anything (docs/templates
 * TD4, TD11). Every problem says where it is and how to fix it, so the studio
 * can jump to the field and the MCP's AI can correct itself:
 *
 *   errors   — the template can't be previewed or published until fixed;
 *   explain  — missing explanations: preview works, publishing doesn't (TD11);
 *   warnings — worth a look, never blocking.
 *
 * Models are checked by the feature planner itself (`planFeature`) inside a
 * **dry scope**: a project id nothing is ever built in, so name and address
 * checks see exactly what a new project is — empty (a website: just the kit).
 */

export type Severity = 'error' | 'explain' | 'warning';
export type Issue = { severity: Severity; part: Part; path: string; message: string; fix: string };
export type PlannedModel = { name: string; route: string; title: string; kit?: boolean };
export type Validation = {
	ok: boolean;
	canPublish: boolean;
	errors: Issue[];
	explain: Issue[];
	warnings: Issue[];
	models: PlannedModel[];
};

/** Nothing is ever built here: the dry scope only gives the planner an empty project to check against. */
const DRY_SCOPE = {
	organization: new mongoose.Types.ObjectId('00000000000000000000d0a1'),
	project: new mongoose.Types.ObjectId('00000000000000000000d0a2'),
};

const lower = (s: string) => String(s || '').toLowerCase();

const ANSWER = /\{\{\s*([A-Za-z][\w]*)\s*\}\}/g;

/**
 * Field defaults that are a question's answer (`{{paymentTerms}}`) can't be
 * checked as written — the planner would compare the braces with the field's
 * allowed values. Instead every option a choice question offers is checked
 * against the field, and the steps go to the planner (a copy) with a sample
 * answer filled in: the question's default, else its first option.
 */
const answerDefaults = (rawSteps: any[], questions: any[], add: (severity: Severity, part: Part, path: string, message: string, fix: string) => void) => {
	const byKey = new Map<string, any>(questions.filter(q => q?.key).map(q => [q.key, q]));
	const sample = (k: string) => {
		const q = byKey.get(k);
		return q ? String(q.default || q.options?.[0]?.value || '') : `{{${k}}}`;
	};
	const steps = JSON.parse(JSON.stringify(rawSteps));
	steps.forEach((s: any, i: number) => {
		const visit = (fields: any[], path: string, prefix: string) =>
			(fields || []).forEach((f: any, j: number) => {
				if (!f || typeof f !== 'object') return;
				const where = `${path}[${j}]`;
				const name = `${s.title || s.name || `Step ${i + 1}`} › ${prefix}${f.label || f.key}`;
				if (Array.isArray(f.fields)) visit(f.fields, `${where}.fields`, `${prefix}${f.label || f.key} › `);
				if (typeof f.default !== 'string' || !f.default.includes('{{')) return;
				const keys = [...f.default.matchAll(ANSWER)].map(m => m[1]);
				if (!keys.length) return;
				const asField = (value: string) => defaultOf({ kind: f.kind, default: value });
				const allowed = enumOf({ kind: f.kind, options: (f.options || []).map((o: any) => ({ value: typeof o === 'object' ? o?.value : o })) });
				const q = keys.length === 1 && f.default.trim() === `{{${keys[0]}}}` ? byKey.get(keys[0]) : null;
				if (q?.kind === 'select') {
					const bad = (q.options || [])
						.map((o: any) => String(o.value))
						.filter((v: string) => {
							const d = asField(v);
							return d === undefined || (allowed && !(Array.isArray(d) ? d : [d]).every(x => allowed.includes(x)));
						});
					if (bad.length)
						add(
							'error',
							'models',
							`models.steps[${i}].${where}.default`,
							`${name}: its default is the answer to “${q.label || q.key}”, but ${bad.map((v: string) => `“${v}”`).join(', ')} ${bad.length === 1 ? 'isn’t' : 'aren’t'} ${allowed ? 'one of the field’s allowed values' : `a valid ${f.kind}`}.`,
							allowed ? 'Give the question and the field the same options, or drop the default.' : 'Change the question’s options, or drop the default.'
						);
				} else if (f.kind === 'number' && q)
					add(
						'warning',
						'models',
						`models.steps[${i}].${where}.default`,
						`${name} is a number, but its default is the answer to “${q.label || q.key}”, which can be any text — one that isn’t a number leaves it empty.`,
						'Make the question a choice of numbers.'
					);
				f.default = f.default.replace(ANSWER, (_m: string, k: string) => sample(k));
			});
		visit(s.fields, 'fields', '');
	});
	return steps as any[];
};

/** How a sample link names its record (records.helpers `refIds`): these fields, or any unique text field, ignoring case. */
const NAMING = ['name', 'title', 'label', 'code', 'email', 'slug'];
const MAX_SAMPLE_ISSUES = 6;

/**
 * Sample records checked the way the build will save them — a wrong choice,
 * a missing required value, a number or date that isn't one, or a link to a
 * record the sample data doesn't have would otherwise only fail the build.
 * Answers (`{{key}}`) are left alone; dates may be relative ("now-12d").
 */
const checkSampleData = (
	rawSteps: any[],
	models: PlannedModel[],
	sampleOf: Map<string, any[]>,
	add: (severity: Severity, part: Part, path: string, message: string, fix: string) => void
) => {
	const stepOf = (m: PlannedModel) => rawSteps.find(s => s?.action !== 'update' && [stepIdentity(s).name, stepIdentity(s).title].some(x => lower(x) === lower(m.name) || lower(x) === lower(m.title)));
	const modelOf = (ref: string) => models.find(m => !m.kit && [m.name, m.title, m.route].some(x => lower(x) === lower(ref)));
	const isAnswer = (v: any) => typeof v === 'string' && v.includes('{{');
	/** Every way a sample record of `m` can be linked to, lower-cased; null when it can't be known (codes are made at build time). */
	const namesOf = (m: PlannedModel) => {
		const s = stepOf(m);
		if (!s || s.code?.enabled) return null;
		const keys = new Set([...NAMING, ...(s.fields || []).filter((f: any) => f?.unique && ['text', 'email', 'url'].includes(f.kind)).map((f: any) => f.key)]);
		const out = new Set<string>();
		for (const r of sampleOf.get(m.name) || []) for (const k of keys) if (r?.[k] !== undefined && r[k] !== null) out.add(lower(String(r[k]).trim()));
		return out;
	};

	for (const [name, rows] of sampleOf) {
		const m = models.find(x => x.name === name);
		const s = m && !m.kit ? stepOf(m) : null;
		if (!m || !s) continue;
		const issues: string[] = [];
		const fields: any[] = (s.fields || []).filter((f: any) => f?.key);
		rows.forEach((r: any, i: number) => {
			const at = `record ${i + 1}`;
			for (const f of fields) {
				const v = r?.[f.key];
				const label = f.label || f.key;
				if (v === undefined || v === null || v === '') {
					if (f.required && f.default === undefined && !['formula', 'boolean'].includes(f.kind)) issues.push(`${at} has no ${label}, which is required`);
					continue;
				}
				if (isAnswer(v)) continue;
				const options = (f.options || []).map((o: any) => String(typeof o === 'object' ? o?.value : o));
				const choices = options.some((o: string) => o.includes('{{')) ? null : options;
				if (f.kind === 'select' && choices?.length && !choices.includes(String(v)))
					issues.push(`${at}: ${label} “${v}” isn’t one of ${choices.join(', ')}`);
				else if (f.kind === 'multiselect' && choices?.length) {
					const bad = ([] as any[]).concat(v).filter(x => !choices.includes(String(x)));
					if (bad.length) issues.push(`${at}: ${label} ${bad.map(x => `“${x}”`).join(', ')} isn’t one of ${choices.join(', ')}`);
				} else if (f.kind === 'number' && (typeof v === 'boolean' || Array.isArray(v) || Number.isNaN(Number(v))))
					issues.push(`${at}: ${label} “${v}” isn’t a number`);
				else if (f.kind === 'date' && relativeDate(v) === v && Number.isNaN(Date.parse(String(v))))
					issues.push(`${at}: ${label} “${v}” isn’t a date — use 2026-10-01, or relative: now, now-12d, now+1m`);
				else if (f.kind === 'reference' || f.kind === 'references') {
					const target = modelOf(f.ref);
					if (!target) continue;
					const names = namesOf(target);
					if (!names) continue;
					const wanted = ([] as any[]).concat(v).filter(x => typeof x === 'string' && !/^[a-f0-9]{24}$/i.test(x));
					const missing = wanted.filter(x => !names.has(lower(x.trim())));
					if (missing.length)
						issues.push(
							sampleOf.has(target.name)
								? `${at}: ${label} links to ${missing.map(x => `“${x}”`).join(', ')}, which no sample ${target.title} record is called`
								: `${at}: ${label} links to a ${target.title} record, but there are no sample ${target.title}`
						);
				}
			}
		});
		if (issues.length)
			add(
				'error',
				'sampleData',
				`sampleData.${name}`,
				`Sample ${m.title}: ${issues.slice(0, MAX_SAMPLE_ISSUES).join('; ')}${issues.length > MAX_SAMPLE_ISSUES ? ` — and ${issues.length - MAX_SAMPLE_ISSUES} more` : ''}.`,
				'Fix those records — the build would stop on them and the preview would fail.'
			);
	}
};

export const validateTemplate = async (req: any, type: TemplateType, bp: any): Promise<Validation> => {
	const issues: Issue[] = [];
	const add = (severity: Severity, part: Part, path: string, message: string, fix: string) =>
		issues.push({ severity, part, path, message, fix });

	/* ---------------------------------------------------------- overview */
	const o = bp.overview || {};
	if (!o.name) add('error', 'overview', 'overview.name', 'The template has no name.', 'Give it a short name people will recognise, e.g. “Finance management”.');
	if (!o.summary)
		add('explain', 'overview', 'overview.summary', 'There’s no summary.', 'Write one sentence on what a project built from it does — it’s the line under the name in the gallery.');
	if (!o.description)
		add('explain', 'overview', 'overview.description', 'There’s no description.', 'Describe what’s inside and how people use it day to day, in a few short paragraphs.');
	if (!o.audience)
		add('explain', 'overview', 'overview.audience', 'It doesn’t say who it’s for.', 'Say who should pick it, e.g. “Small agencies that bill clients monthly”.');
	if (!o.category) add('warning', 'overview', 'overview.category', 'There’s no category.', 'Pick a category so it can be found in the gallery (Finance, Sales, Blog…).');
	if (!o.cover) add('warning', 'overview', 'overview.cover', 'There’s no cover image.', 'Add a cover — the gallery shows it on the template’s card.');

	/* ------------------------------------------------------------ models */
	const rawSteps: any[] = bp.models?.steps || [];
	const kit = type === 'website' ? planFromAi(WEBSITE_KIT('Website')).steps : [];
	const models: PlannedModel[] = [];

	rawSteps.forEach((s, i) => {
		if (s.action === 'update')
			add(
				'error',
				'models',
				`models.steps[${i}]`,
				`Step ${i + 1} changes an existing model (${s.model || 'unnamed'}), but a template starts from an empty project${type === 'website' ? ' (just the website kit, which templates can’t change yet)' : ''}.`,
				'Make it a new model, or add these fields where that model is created.'
			);
	});
	if (!rawSteps.length && type !== 'website')
		add('error', 'models', 'models.steps', 'There are no models.', 'Add at least one model — the records people will keep (Clients, Invoices…).');
	if (rawSteps.length > TEMPLATE_MAX_STEPS)
		add('error', 'models', 'models.steps', `A template holds at most ${TEMPLATE_MAX_STEPS} models (this one has ${rawSteps.length}).`, 'Remove the models it can do without, or split it into two templates.');

	const creates = answerDefaults(rawSteps, bp.questions || [], add)
		.filter(s => s.action !== 'update')
		.slice(0, TEMPLATE_MAX_STEPS);
	if (creates.length) {
		const input = planFromAi({
			title: o.name || 'Template',
			summary: o.summary || o.name || 'Template',
			steps: [...kit, ...creates],
		});
		const plan = await runInScope(DRY_SCOPE, () =>
			planFeature(req, { ...input, sidebarCategory: undefined }, { maxSteps: kit.length + TEMPLATE_MAX_STEPS })
		);
		// Where each checked step sits in the blueprint (update steps were left out).
		const indexOf = rawSteps.map((s, i) => (s.action !== 'update' ? i : -1)).filter(i => i >= 0);
		for (const p of plan.problems) add('error', 'models', 'models', p, 'Fix it on the Models tab, then check again.');
		for (const step of plan.steps) {
			if (step.action !== 'create') continue;
			const c = step as CreateStep;
			const isKit = step.index < kit.length;
			if (isKit) {
				models.push({ name: c.name, route: c.route, title: c.title, kit: true });
				continue;
			}
			const i = indexOf[step.index - kit.length];
			const where = `models.steps[${i}]`;
			const label = c.title || c.name || `Step ${i + 1}`;
			for (const p of step.problems) add('error', 'models', where, `${label}: ${p}`, 'Change this model on the Models tab, then check again.');
			models.push({ name: c.name, route: c.route, title: c.title });
			const wanted = stepIdentity(rawSteps[i]);
			if (c.name && wanted.name && c.name !== wanted.name)
				add('warning', 'models', where, `${label} will be built as ${c.name} (${wanted.name} is taken in every project).`, `Rename it yourself if ${c.name} reads badly.`);
			else if (c.route && wanted.route && c.route !== wanted.route)
				add(
					'warning',
					'models',
					where,
					`${label} will be at /${c.route} (/${wanted.route} is taken in every project) — that's its public API address too.`,
					'Give the model a route of its own (e.g. route: "work"), or rename it.'
				);
			if (!c.description)
				add('explain', 'models', `${where}.description`, `${label} has no description.`, 'Add one line on what these records are — it shows under the page title.');
			if (!c.rationale)
				add('warning', 'models', `${where}.rationale`, `${label} doesn’t say why it’s there.`, 'Add a sentence on why the template needs it and how it links to the others.');
			const bare = (c.fields || []).filter((f: any) => !f?.helper && !['section', 'sectionlist'].includes(f?.kind)).map((f: any) => f.label || f.key);
			if (bare.length)
				add(
					'warning',
					'models',
					`${where}.fields`,
					`${label}: ${bare.length} field${bare.length === 1 ? ' has' : 's have'} no help text (${bare.slice(0, 6).join(', ')}${bare.length > 6 ? '…' : ''}).`,
					'Add help text where a field isn’t obvious — it shows under the input.'
				);
		}
	}

	/* A model reference in the other parts: its name, title or route. */
	const find = (q: string) => {
		const k = lower(q);
		return models.find(m => lower(m.name) === k || lower(m.route) === k || lower(m.title) === k) || null;
	};
	const kitNote = type === 'website' ? ' or a website kit model (pages, seo, web-contents)' : '';
	const unknownModel = (part: Part, path: string, what: string, q: string) =>
		add('error', part, path, `${what} points at “${q}”, which isn’t a model in this template.`, `Use one of the template’s models${kitNote}, or remove it.`);

	/* ----------------------------------------------------------- sidebar */
	(bp.sidebar || []).forEach((c: any, i: number) => {
		if (!c.name) add('error', 'sidebar', `sidebar[${i}].name`, `Sidebar category ${i + 1} has no name.`, 'Name it, e.g. “Finance”.');
		if (!c.items.length) add('warning', 'sidebar', `sidebar[${i}].items`, `Sidebar category “${c.name || i + 1}” is empty.`, 'Add pages to it or remove it.');
		c.items.forEach((it: any, j: number) => {
			if (!find(it.model)) unknownModel('sidebar', `sidebar[${i}].items[${j}]`, `A sidebar item in “${c.name}”`, it.model);
		});
	});

	/* --------------------------------------------------------- dashboard */
	(bp.dashboard || []).forEach((w: any, i: number) => {
		const m = find(w?.route || w?.model || '');
		if (!m) return unknownModel('dashboard', `dashboard[${i}]`, `Widget ${i + 1}`, w?.route || w?.model || '(none)');
		const { error } = normalizeWidget({ ...w, route: m.route }, i);
		if (error) add('error', 'dashboard', `dashboard[${i}]`, error, 'Fix the widget in the Dashboard tab.');
		else if (!w.title) add('warning', 'dashboard', `dashboard[${i}].title`, `Widget ${i + 1} has no title.`, 'Give it a title that says what the number or chart shows.');
	});

	/* ------------------------------------------------------------- roles */
	const roleNames = new Set<string>();
	const systemNames = Object.values(SYSTEM_ROLE_DEFAULTS).map(r => lower(r.name));
	(bp.roles || []).forEach((r: any, i: number) => {
		const where = `roles[${i}]`;
		if (!r.name) return add('error', 'roles', `${where}.name`, `Role ${i + 1} has no name.`, 'Name it after the job, e.g. “Accountant”.');
		if (roleNames.has(lower(r.name))) add('error', 'roles', `${where}.name`, `Two roles are called “${r.name}”.`, 'Rename or remove one.');
		roleNames.add(lower(r.name));
		if (systemNames.includes(lower(r.name)))
			add('warning', 'roles', `${where}.name`, `Every organization already has a “${r.name}” role, so this one will be skipped.`, 'Give it a different name.');
		const bad = r.permissions.filter((p: string) => p !== '*' && !ORG_PERMISSION_KEYS.includes(p));
		if (bad.length)
			add('error', 'roles', `${where}.permissions`, `“${r.name}” has unknown permissions: ${bad.join(', ')}.`, `Use these: ${ORG_PERMISSION_KEYS.join(', ')}.`);
		if (!r.permissions.length) add('error', 'roles', `${where}.permissions`, `“${r.name}” can’t do anything.`, 'Tick at least one permission (records:view to see records).');
		if (!r.description) add('warning', 'roles', `${where}.description`, `“${r.name}” has no description.`, 'Say in a line who gets this role.');
	});

	/* --------------------------------------------------------- endpoints */
	(bp.endpoints || []).forEach((e: any, i: number) => {
		const where = `endpoints[${i}]`;
		if (!find(e.model)) return unknownModel('endpoints', where, `Endpoint ${i + 1}`, e.model || '(none)');
		const bad = e.actions.filter((a: string) => !PUBLIC_ACTIONS.includes(a));
		if (bad.length) add('error', 'endpoints', `${where}.actions`, `Unknown actions: ${bad.join(', ')}.`, `Use ${PUBLIC_ACTIONS.join(', ')}.`);
		const { error } = PUBLIC_API.validate({ enabled: true, actions: e.actions.filter((a: string) => PUBLIC_ACTIONS.includes(a)), auth: e.auth, ownerOnly: e.ownerOnly });
		if (error) add('error', 'endpoints', where, error.details[0].message.replace(/"/g, ''), 'Fix it on the Public API tab.');
		if (e.ownerOnly && e.auth !== 'customer')
			add('error', 'endpoints', `${where}.ownerOnly`, `${e.model}: “each customer only their own records” needs signed-in customers.`, 'Set who can call it to signed-in customers, or turn owner-only off.');
		if (!e.actions.length) add('warning', 'endpoints', `${where}.actions`, `${e.model}: no actions picked, so it will be list and get.`, 'Pick the actions the site or app needs.');
		// Create-only is a form (contact, sign-up): anyone can send, nobody can read back — no warning.
		const formOnly = e.actions.length === 1 && e.actions[0] === 'create';
		if (e.auth === 'none' && !formOnly && e.actions.some((a: string) => ['create', 'update', 'delete'].includes(a)))
			add('warning', 'endpoints', where, `${e.model}: anyone on the internet can write to it.`, 'Fine for a contact form (then open create only); otherwise require signed-in customers.');
		if (!e.note) add('warning', 'endpoints', `${where}.note`, `${e.model}’s endpoint has no note.`, 'Say what the site or app uses it for — the API reference shows it.');
	});

	/* ---------------------------------------------------------- webhooks */
	(bp.webhooks || []).forEach((w: any, i: number) => {
		const where = `webhooks[${i}]`;
		if (!find(w.model)) return unknownModel('webhooks', where, `Webhook ${i + 1}`, w.model || '(none)');
		const bad = w.events.filter((ev: string) => !WEBHOOK_EVENTS.includes(ev));
		if (bad.length || !w.events.length)
			add('error', 'webhooks', `${where}.events`, `Webhook ${i + 1} needs events from: ${WEBHOOK_EVENTS.join(', ')}.`, 'Pick when it fires.');
		if (!w.url)
			add(
				'warning',
				'webhooks',
				`${where}.url`,
				`Webhook ${i + 1} has no address, so it’s made switched off.`,
				'Ask for it: add a question of kind “url” and put its {{key}} here — or leave it for the project to fill in.'
			);
		else if (!/\{\{\s*[\w-]+\s*\}\}/.test(w.url) && !/^https?:\/\/[^\s/]+/.test(w.url))
			add('error', 'webhooks', `${where}.url`, `Webhook ${i + 1}’s address “${w.url}” isn’t a web address.`, 'Start it with https://, or use a question’s {{key}}.');
		if (!w.note) add('warning', 'webhooks', `${where}.note`, `Webhook ${i + 1} has no note.`, 'Say what the receiving system does with it.');
	});
	if (type === 'api' && !(bp.endpoints || []).length)
		add('warning', 'endpoints', 'endpoints', 'This API template opens no endpoints.', 'Turn on the public API for the models the tenant’s site or app calls (Public API tab).');

	/* ----------------------------------------------------------- website */
	if (type === 'website') {
		const pages: any[] = bp.website?.pages || [];
		const paths = new Set<string>();
		pages.forEach((p, i) => {
			const where = `website.pages[${i}]`;
			if (!/^\/[\w\-/]*$/.test(p.path)) add('error', 'website', `${where}.path`, `Page ${i + 1}’s path “${p.path}” isn’t a path.`, 'Start it with “/”: “/” for home, “/about”, “/services/web”.');
			if (paths.has(p.path)) add('error', 'website', `${where}.path`, `Two pages have the path “${p.path}”.`, 'Change one of them.');
			paths.add(p.path);
			if (!p.name) add('error', 'website', `${where}.name`, `The page at “${p.path}” has no name.`, 'Name it as it reads in the menu, e.g. “About us”.');
			// The kit's SEO record needs both a title and a description: half of one can't be saved.
			const seoLevel: Severity = p.seo?.title || p.seo?.description ? 'error' : 'warning';
			if (!p.seo?.title) add(seoLevel, 'website', `${where}.seo.title`, `“${p.name || p.path}” has no SEO title.`, 'Add the title search results and browser tabs show (up to 120 characters).');
			if (!p.seo?.description)
				add(seoLevel, 'website', `${where}.seo.description`, `“${p.name || p.path}” has no SEO description.`, 'Add the sentence or two search results show under the title (up to 320 characters).');
			const slugs = new Set<string>();
			p.contents.forEach((b: any, j: number) => {
				const bw = `${where}.contents[${j}]`;
				if (!b.slug) add('error', 'website', `${bw}.slug`, `Block ${j + 1} on “${p.path}” has no slug.`, 'Give it a stable key the site code finds it by, e.g. “hero”.');
				else if (slugs.has(b.slug)) add('error', 'website', `${bw}.slug`, `Two blocks on “${p.path}” are “${b.slug}”.`, 'Slugs must be unique on a page.');
				slugs.add(b.slug);
				if (b.category && !BLOCK_CATEGORIES.includes(b.category))
					add('error', 'website', `${bw}.category`, `Block “${b.slug}” has an unknown category “${b.category}”.`, `Use one of: ${BLOCK_CATEGORIES.join(', ')}.`);
			});
		});
		pages.forEach((p, i) => {
			if (p.parent && !paths.has(p.parent))
				add('error', 'website', `website.pages[${i}].parent`, `“${p.path}” has the parent “${p.parent}”, which isn’t a page here.`, 'Pick an existing page as its parent, or clear it.');
		});
		if (!pages.length) add('warning', 'website', 'website.pages', 'The website has no pages.', 'Add at least the home page (“/”).');
		else if (!paths.has('/')) add('warning', 'website', 'website.pages', 'There’s no home page.', 'Add a page with the path “/”.');
		const repo = bp.website?.starter?.repoUrl;
		if (repo && !/^https:\/\/\S+$/.test(repo))
			add('error', 'website', 'website.starter.repoUrl', 'The starter code’s repository isn’t an https link.', 'Paste the repository’s https URL, e.g. https://github.com/you/site.');
		const starter = bp.website?.starter || {};
		if (starter.deployUrl && !/^https:\/\/\S+$/.test(starter.deployUrl))
			add('error', 'website', 'website.starter.deployUrl', 'The deploy button’s link isn’t an https link.', 'Paste the host’s deploy URL, e.g. https://vercel.com/new/clone?repository-url=…');
		if (!repo && (starter.deployUrl || (starter.env || []).length))
			add('warning', 'website', 'website.starter.repoUrl', 'The starter code has settings but no repository.', 'Add the repository the project’s site starts from, or clear the rest.');
		const envKeys = new Set<string>();
		(starter.env || []).forEach((e: any, i: number) => {
			if (!/^[A-Z][A-Z0-9_]*$/.test(e.key))
				add('error', 'website', `website.starter.env[${i}].key`, `“${e.key}” isn’t an environment variable name.`, 'Use capitals, digits and _, starting with a letter, e.g. NEXT_PUBLIC_API.');
			else if (envKeys.has(e.key)) add('error', 'website', `website.starter.env[${i}].key`, `${e.key} is listed twice.`, 'Keep one.');
			envKeys.add(e.key);
			if (!e.value) add('warning', 'website', `website.starter.env[${i}].value`, `${e.key} has no value.`, 'Fill it in, or use {{api}} / {{slug}} — the project’s API address and public name.');
		});
	}

	/* -------------------------------------------------------- sampleData */
	const sampleOf = new Map<string, any[]>();
	for (const [model, rows] of Object.entries(bp.sampleData || {}) as [string, any[]][]) {
		const m = find(model);
		if (!m) unknownModel('sampleData', `sampleData.${model}`, 'Sample data', model);
		else if (!rows.length) add('warning', 'sampleData', `sampleData.${model}`, `There are no sample ${m.title} records.`, 'Add a few, or remove the empty list.');
		else sampleOf.set(m.name, rows);
	}
	checkSampleData(rawSteps, models, sampleOf, add);

	/* --------------------------------------------------------- questions */
	const qKeys = new Set<string>();
	// An address asked only for a webhook may be skipped: the webhook is then made switched off, as intended.
	const { webhooks: _webhooks, questions: _questions, ...rest } = bp || {};
	const elsewhere = JSON.stringify(rest);
	const webhookOnly = (q: any) =>
		q.kind === 'url' &&
		(bp.webhooks || []).some((w: any) => new RegExp(`\\{\\{\\s*${q.key}\\s*\\}\\}`).test(w.url || '')) &&
		!new RegExp(`\\{\\{\\s*${q.key}\\s*\\}\\}`).test(elsewhere);
	(bp.questions || []).forEach((q: any, i: number) => {
		const where = `questions[${i}]`;
		if (!/^[a-z][A-Za-z0-9_]{0,39}$/.test(q.key))
			add('error', 'questions', `${where}.key`, `Question ${i + 1}’s key “${q.key}” can’t be used.`, 'Use a short camelCase key that starts with a letter, e.g. “currency”.');
		if (qKeys.has(q.key)) add('error', 'questions', `${where}.key`, `Two questions use the key “${q.key}”.`, 'Give each question its own key.');
		if (BUILTIN_PLACEHOLDERS.includes(q.key))
			add('error', 'questions', `${where}.key`, `“${q.key}” is filled in automatically.`, `Pick another key — ${BUILTIN_PLACEHOLDERS.join(', ')} are built in.`);
		qKeys.add(q.key);
		if (!q.label) add('error', 'questions', `${where}.label`, `Question “${q.key}” has no label.`, 'Write the question as people will read it, e.g. “Which currency do you bill in?”.');
		if (q.kind === 'select' && !q.options?.length) add('error', 'questions', `${where}.options`, `“${q.label || q.key}” is a choice with no options.`, 'Add the options to choose from.');
		if (!q.required && !q.default && !webhookOnly(q))
			add('warning', 'questions', `${where}.default`, `“${q.label || q.key}” is optional with no default, so skipping it leaves the text blank.`, 'Give it a default, or make it required.');
	});
	const used = placeholdersUsed(bp);
	for (const [k, part] of used)
		if (!qKeys.has(k) && !BUILTIN_PLACEHOLDERS.includes(k))
			add('error', part, part, `{{${k}}} is used but no question has the key “${k}”.`, `Add a question with the key “${k}”, or remove {{${k}}}.`);
	for (const k of qKeys)
		if (!used.has(k)) add('warning', 'questions', 'questions', `The answer to “${k}” isn’t used anywhere.`, `Put {{${k}}} where the answer belongs, or remove the question.`);

	/* ------------------------------------------------------------- guide */
	const steps = bp.guide?.steps || [];
	if (!steps.length)
		add('explain', 'guide', 'guide.steps', 'There’s no setup guide.', 'Add the first things to do after it’s built — e.g. “Add your logo”, “Import your clients” — each with the page it opens.');
	steps.forEach((s: any, i: number) => {
		if (!s.title) add('error', 'guide', `guide.steps[${i}].title`, `Setup step ${i + 1} has no title.`, 'Write it as an action: “Add your first client”.');
		if (!s.body) add('warning', 'guide', `guide.steps[${i}].body`, `“${s.title || i + 1}” has no explanation.`, 'Add a sentence or two on how and why.');
		if (s.page && !find(s.page) && !s.page.startsWith('/'))
			add('warning', 'guide', `guide.steps[${i}].page`, `“${s.title}” opens “${s.page}”, which isn’t a model here.`, 'Use a model of the template, or a panel path such as /site-setup.');
	});

	const errors = issues.filter(i => i.severity === 'error');
	const explain = issues.filter(i => i.severity === 'explain');
	return {
		ok: !errors.length,
		canPublish: !errors.length && !explain.length,
		errors,
		explain,
		warnings: issues.filter(i => i.severity === 'warning'),
		models,
	};
};
