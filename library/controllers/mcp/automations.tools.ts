import mongoose from 'mongoose';
import Automation, { ACTION_TYPES, AUTOMATION_EVENTS } from '../../models/tenancy/automation.model.js';
import AutomationRun from '../../models/tenancy/automationRun.model.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import MailDesign from '../../models/tenancy/mailDesign.model.js';
import MailMessage from '../../models/tenancy/mailMessage.model.js';
import { checkAutomation, dryRun, newAutomationSecret } from '../../functions/automations.function.js';
import { LOCK_OPS } from '../../functions/fieldLocks.function.js';
import { projectPeople } from '../../functions/tenancy.function.js';
import { resolveMailConfig } from '../../functions/mail.function.js';
import { currentScope } from '../../functions/tenantScope.function.js';
import { scopedModel } from '../../functions/routeRegistry.function.js';
import { recordProjectEvent } from '../../functions/recordHistory.function.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * Automations over MCP (docs/automations AU-06): the user's own AI lists a
 * project's automations, makes or changes one, tries it on a record (nothing
 * sent or written), reads its runs and deletes one — through the same checks
 * as the panel's /automations API (checkAutomation, dryRun), so what the AI
 * saves is exactly what the panel would.
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string, data?: any): Out => ({ text, isError: true, ...(data && { data }) });
const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const EVENT_WORD: Record<string, string> = { create: 'created', update: 'changed', delete: 'deleted' };
const ACTION_WORD: Record<string, string> = { notify: 'Notify people', email: 'Send an email', webhook: 'Call a webhook', update: 'Update a record', create: 'Create a record' };

const condText = (c: any) => (c.op === 'empty' || c.op === 'filled' ? `${c.field} ${c.op}` : `${c.field} ${c.op} ${JSON.stringify(c.value ?? '')}`);

const actionText = (a: any, people: Map<string, string>) => {
	const who = (to: any) =>
		[...(to?.people || []).map((p: any) => people.get(String(p)) || String(p)), ...(to?.actor ? ['the person who saved it'] : []), ...(to?.fields || []).map((f: string) => `the record's ${f}`), ...(to?.emails || [])].join(', ');
	switch (a.type) {
		case 'notify':
			return `Notify ${who(a.to)}: “${a.title}”`;
		case 'email':
			return `Email ${who(a.to)}: “${a.subject}”${a.attach?.length ? ` with ${a.attach.length} PDF(s)` : ''}`;
		case 'webhook':
			return `Call ${a.url}`;
		case 'update':
			return `Update ${a.target === 'this' ? 'this record' : `the linked ${a.target}`}: ${(a.set || []).map((s: any) => s.field).join(', ')}`;
		case 'create':
			return `Create a record in ${a.route}: ${(a.set || []).map((s: any) => s.field).join(', ')}`;
		default:
			return a.type;
	}
};

const line = (a: any, titles: Map<string, string>, people: Map<string, string>) => {
	const when = (a.on || []).map((e: string) => (e === 'update' && a.changed?.length ? `changed (${a.changed.join(', ')})` : EVENT_WORD[e])).join(' or ');
	const conds = a.when?.length ? `; only if ${a.when.map(condText).join(a.match === 'any' ? ' or ' : ' and ')}` : '';
	const stats = a.stats ? `; ${a.stats.runs || 0} runs, ${a.stats.failures || 0} failed` : '';
	return `- ${a.enabled === false ? '(off) ' : ''}“${a.name}” — when a ${titles.get(a.route) || a.route} record is ${when}${conds} → ${(a.actions || []).map((x: any) => actionText(x, people)).join('; ')}${stats} [id ${a._id}]`;
};

const view = (a: any) => ({
	_id: String(a._id),
	name: a.name,
	description: a.description || '',
	enabled: a.enabled !== false,
	route: a.route,
	on: a.on || [],
	changed: a.changed || [],
	when: a.when || [],
	match: a.match || 'all',
	actions: a.actions || [],
	stats: a.stats || { runs: 0, failures: 0 },
});

const peopleMap = async () => new Map<string, string>((await projectPeople()).map((p: any) => [String(p._id), p.name || p.email]));

/** Where the project's emails go out from — or why they can't. */
export const mailFrom = async (caller: Caller) => {
	const s = currentScope();
	const cfg: any = s ? await resolveMailConfig(s.organization, s.project).catch(() => null) : null;
	return cfg
		? `Emails go out from ${cfg.fromName ? `${cfg.fromName} <${cfg.fromAddress}>` : cfg.fromAddress}.`
		: `No email account is connected, so email actions will fail — the user connects one in the panel (Project → Email: ${caller.link('/email-accounts')}).`;
};

const listAutomations = async (_req: any, _args: any, caller: Caller): Promise<Out> => {
	const project = currentScope()?.project;
	const [docs, defs, people, designs, from]: any[] = await Promise.all([
		Automation.find({}).sort({ createdAt: -1 }).limit(200).lean(),
		ModelDefinition.find({ active: { $ne: false } }, { route: 1, name: 1, title: 1 }).lean(),
		projectPeople(),
		project ? MailDesign.find({ project }, { name: 1, isDefault: 1 }).lean() : [],
		mailFrom(caller),
	]);
	const titles = new Map<string, string>(defs.map((d: any) => [d.route, d.title || d.name]));
	const names = new Map<string, string>(people.map((p: any) => [String(p._id), p.name || p.email]));
	const lines = [
		docs.length ? `${docs.length} automation(s) — in the panel: ${caller.link('/automations')}` : `No automations yet — in the panel: ${caller.link('/automations')}`,
		...docs.map((a: any) => line(a, titles, names)),
		'',
		from,
		designs.length ? `Email designs (an email action's \`design\`; none = the default): ${designs.map((d: any) => `${d.name}${d.isDefault ? ' (default)' : ''} [${d._id}]`).join(', ')}` : 'Email designs: none — emails use the plain look.',
		people.length ? `People in the project (for \`to.people\`): ${people.map((p: any) => `${p.name || p.email} <${p.email}> [${p._id}]`).join(', ')}` : '',
	].filter(l => l !== '');
	return {
		text: lines.join('\n'),
		data: { automations: docs.map(view), mailFrom: from, designs: designs.map((d: any) => ({ _id: String(d._id), name: d.name, isDefault: !!d.isDefault })), people: people.map((p: any) => ({ _id: String(p._id), name: p.name, email: p.email })) },
	};
};

const saveAutomation = async (req: any, args: any, caller: Caller): Promise<Out> => {
	let current: any = null;
	if (args?.id) {
		current = isId(args.id) ? await Automation.findById(String(args.id)).lean() : null;
		if (!current) return refuse(`No automation ${args.id} — list_automations shows them.`);
	}
	// Changing one: what's left out is kept, so { id, enabled: false } just turns it off.
	const keys = ['name', 'description', 'route', 'on', 'changed', 'when', 'match', 'actions', 'enabled'];
	const input: any = Object.fromEntries(keys.map(k => [k, args?.[k] !== undefined ? args[k] : current?.[k]]));
	let body: any;
	try {
		body = await checkAutomation(input);
	} catch (e: any) {
		return refuse(`${e?.extra?.on ? `${e.extra.on}: ` : ''}${e?.message || 'That automation isn’t valid'}`);
	}
	let saved: any;
	if (current) {
		await Automation.updateOne({ _id: current._id }, { $set: { ...body, updatedBy: caller.user?._id } });
		saved = await Automation.findById(current._id).lean();
	} else {
		if ((await Automation.countDocuments({})) >= 200) return refuse('This project has 200 automations — delete one first.');
		saved = (await Automation.create({ ...body, secret: newAutomationSecret(), createdBy: caller.user?._id, updatedBy: caller.user?._id })).toObject();
	}
	recordProjectEvent({
		req,
		action: current ? 'update' : 'create',
		model: 'Automation',
		modelPath: 'automations',
		document: saved._id,
		name: saved.name,
		text: `${current ? 'changed' : 'created'} the automation “${saved.name}” through the AI`,
	});
	const def: any = await ModelDefinition.findOne({ route: saved.route }, { title: 1, name: 1 }).lean();
	const titles = new Map<string, string>([[saved.route, def?.title || def?.name || saved.route]]);
	const usesEmail = saved.actions.some((a: any) => a.type === 'email');
	return {
		text: [`${current ? 'Saved' : 'Made'} it:`, line(saved, titles, await peopleMap()), ...(usesEmail ? [await mailFrom(caller)] : []), `Try it on a record with test_automation; in the panel: ${caller.link('/automations')}`].join('\n'),
		data: view(saved),
	};
};

const testAutomation = async (_req: any, args: any, _caller: Caller): Promise<Out> => {
	const a: any = isId(args?.id) ? await Automation.findById(String(args.id)).select('+secret').lean() : null;
	if (!a) return refuse(`No automation ${args?.id ?? ''} — list_automations shows them.`);
	let record = String(args?.record || '');
	if (!record) {
		// The newest record of its page, when none is named.
		const def: any = await ModelDefinition.findOne({ route: a.route }, { name: 1 }).lean();
		const Model: any = def && scopedModel(def.name);
		const latest: any = Model ? await Model.findOne({}, { _id: 1 }).sort({ createdAt: -1 }).lean() : null;
		if (!latest) return refuse(`Its page (${a.route}) has no records to try it on — pass \`record\`, or add one first.`);
		record = String(latest._id);
	}
	try {
		const r: any = await dryRun(a, record, String(args?.event || ''));
		const steps = (r.steps || []).map((s: any) => `- ${ACTION_WORD[s.type] || s.type}: ${s.ok ? '' : 'FAILS — '}${s.detail || ''}`);
		return {
			text: [
				`Tried “${a.name}” on ${r.record.name || r.record._id} (as if it was ${EVENT_WORD[r.event]}) — nothing was sent or written.`,
				r.conditions ? 'Its conditions are met.' : 'Its conditions are NOT met by this record, so it wouldn’t run; the actions below show what it would do if they were.',
				...steps,
			].join('\n'),
			data: r,
		};
	} catch (e: any) {
		return refuse(e?.message || 'It couldn’t be tried');
	}
};

const automationRuns = async (_req: any, args: any, _caller: Caller): Promise<Out> => {
	const q: any = {};
	if (args?.id) {
		if (!isId(args.id)) return refuse(`No automation ${args.id} — list_automations shows them.`);
		q.automation = args.id;
	}
	if (['success', 'failed', 'skipped'].includes(String(args?.status))) q.status = String(args.status);
	const runs: any[] = await AutomationRun.find(q).sort({ createdAt: -1 }).limit(Math.min(Math.max(Number(args?.limit) || 20, 1), 100)).lean();
	const project = currentScope()?.project;
	const mails: any[] = runs.length && project ? await MailMessage.find({ project, run: { $in: runs.map(r => r._id) }, resendOf: { $exists: false } }, { run: 1, to: 1, status: 1, error: 1 }).lean() : [];
	if (!runs.length) return { text: 'No runs yet.', data: { runs: [] } };
	const lines = runs.map(r => {
		const sent = mails.filter(m => String(m.run) === String(r._id)).map(m => `${m.to} ${m.status}${m.error ? ` (${m.error})` : ''}`);
		const steps = (r.steps || []).map((s: any) => `${ACTION_WORD[s.type] || s.type}: ${s.ok ? 'ok' : 'failed'}${s.detail ? ` — ${s.detail}` : ''}`);
		return `- ${new Date(r.createdAt).toISOString()} “${r.name}” on ${r.recordName || r.record || 'a record'} (${EVENT_WORD[r.event] || r.event}) → ${r.status}${r.error ? `: ${r.error}` : ''}${steps.length ? `\n    ${steps.join('\n    ')}` : ''}${sent.length ? `\n    emails: ${sent.join(', ')}` : ''}`;
	});
	return { text: ['Runs, newest first:', ...lines].join('\n'), data: { runs } };
};

const deleteAutomation = async (req: any, args: any, _caller: Caller): Promise<Out> => {
	const a: any = isId(args?.id) ? await Automation.findById(String(args.id)).lean() : null;
	if (!a) return refuse(`No automation ${args?.id ?? ''} — list_automations shows them.`);
	await Automation.deleteOne({ _id: a._id });
	await AutomationRun.deleteMany({ automation: a._id });
	recordProjectEvent({ req, action: 'delete', model: 'Automation', modelPath: 'automations', document: a._id, name: a.name, text: `deleted the automation “${a.name}” through the AI` });
	return { text: `Deleted “${a.name}” and its runs.` };
};

const CONDITION = {
	type: 'object',
	required: ['field', 'op'],
	properties: {
		field: { type: 'string', description: 'A field key of the page (or createdAt, updatedAt, code)' },
		op: { type: 'string', enum: [...LOCK_OPS] },
		value: { description: 'The value to compare with (a list for "in"; none for empty/filled)' },
	},
};

const RECIPIENTS = {
	type: 'object',
	properties: {
		people: { type: 'array', items: { type: 'string' }, description: 'Ids of people in the project (list_automations lists them)' },
		actor: { type: 'boolean', description: 'The person who saved the record' },
		fields: { type: 'array', items: { type: 'string' }, description: 'Email only: the record’s email field(s), e.g. "email", or a linked record’s, e.g. "customer.email"' },
		emails: { type: 'array', items: { type: 'string' }, description: 'Email only: typed addresses, up to 10' },
	},
};

const SET = {
	type: 'array',
	items: {
		type: 'object',
		required: ['field'],
		properties: {
			field: { type: 'string', description: 'The field to set on the target record' },
			value: { description: 'A fixed value; text may use {{placeholders}}' },
			from: { type: 'string', description: 'Copy this field of the record that started it (or "_id")' },
			clear: { type: 'boolean', description: 'Empty the field' },
		},
	},
};

const ACTION = {
	type: 'object',
	required: ['type'],
	properties: {
		type: { type: 'string', enum: [...ACTION_TYPES] },
		to: { ...RECIPIENTS, description: 'notify / email: who gets it' },
		title: { type: 'string', description: 'notify: the notification’s title' },
		message: { type: 'string', description: 'notify: its text' },
		subject: { type: 'string', description: 'email: the subject (≤200 characters)' },
		body: {
			type: 'string',
			description:
				'email: the message. A blank line starts a paragraph; **bold**, *italic*, lines starting "- " make a list, and [words](https://…) a link — the address may hold placeholders, e.g. [Unsubscribe](https://example.com/unsubscribe?code={{unsubscribeCode}}).',
		},
		design: { type: 'string', description: 'email: an email design id (list_automations); left out, the project’s default' },
		attach: { type: 'array', items: { type: 'string' }, description: 'email: up to 3 published PDF template ids of the page, printed for the record and attached' },
		url: { type: 'string', description: 'webhook: the https:// address it posts the record to (signed with the automation’s secret)' },
		target: { type: 'string', description: 'update: "this" (the record), or a reference field’s key (the record it links to)' },
		route: { type: 'string', description: 'create: the route of the page to add a record to' },
		set: { ...SET, description: 'update / create: the fields it sets' },
	},
};

export const AUTOMATION_TOOLS: ToolDef[] = [
	{
		name: 'list_automations',
		title: 'List the automations',
		description:
			'The project’s automations — what starts each one (a page’s records created, changed or deleted; which fields changing; conditions) and what it does (notify, email, webhook, update or create a record), on/off, runs and failures, id — plus where its emails go out from, its email designs and the people who can be notified. Call it before save_automation.',
		scope: 'read',
		only: 'project',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: listAutomations,
	},
	{
		name: 'save_automation',
		title: 'Make or change an automation',
		description: `One automation: with \`id\`, changes it (what’s left out is kept — { id, enabled: false } turns it off); without it, makes one. It runs after a record of the page \`route\` is saved: \`on\` lists the events (${AUTOMATION_EVENTS.join(', ')}); \`changed\` narrows "update" to some fields changing; \`when\` conditions (all, or any with match "any") on the record. \`actions\` (1–10) run in order. Texts (titles, subjects, messages, set values) take {{field}} placeholders — the record’s fields, {{ref.field}} for a linked record’s field, and {{link}} {{page}} {{project}} {{actor}} {{event}} {{today}}. Emails go through the project’s email account (Project → Email). Describe the automation to the user in plain words and get their go-ahead before saving; try it with test_automation after.`,
		scope: 'build',
		only: 'project',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'The automation to change (from list_automations); leave out to make a new one' },
				name: { type: 'string', description: 'Up to 80 characters' },
				description: { type: 'string' },
				route: { type: 'string', description: 'The route of the page whose records start it (list_models shows them)' },
				on: { type: 'array', items: { type: 'string', enum: [...AUTOMATION_EVENTS] } },
				changed: { type: 'array', items: { type: 'string' }, description: 'With "update": run only when one of these fields changes' },
				when: { type: 'array', items: CONDITION, description: 'Conditions on the record; [] for none' },
				match: { type: 'string', enum: ['all', 'any'] },
				actions: { type: 'array', items: ACTION },
				enabled: { type: 'boolean' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		run: saveAutomation,
	},
	{
		name: 'test_automation',
		title: 'Try an automation on a record',
		description:
			'A dry run: what each of the automation’s actions would do for one record (whom it would email and the subject, what it would set) and whether the record meets its conditions — nothing is sent or written. Without `record`, the page’s newest record.',
		scope: 'build',
		only: 'project',
		inputSchema: {
			type: 'object',
			required: ['id'],
			properties: {
				id: { type: 'string' },
				record: { type: 'string', description: 'A record id of its page' },
				event: { type: 'string', enum: [...AUTOMATION_EVENTS], description: 'As if the record was created, changed or deleted (default: its first)' },
			},
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: testAutomation,
	},
	{
		name: 'get_automation_runs',
		title: 'Read automations’ runs',
		description: 'Recent runs, newest first — of one automation (`id`) or all: the record, the event, each action’s result and error, and the emails it sent (to, sent or failed and why).',
		scope: 'read',
		only: 'project',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'One automation; left out, all of them' },
				status: { type: 'string', enum: ['success', 'failed', 'skipped'] },
				limit: { type: 'number', description: 'Up to 100 (default 20)' },
			},
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: automationRuns,
	},
	{
		name: 'delete_automation',
		title: 'Delete an automation',
		description: 'Deletes an automation and its runs. Only on the user’s say-so — to pause one, save it with enabled: false instead.',
		scope: 'build',
		only: 'project',
		inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		run: deleteAutomation,
	},
];

/** The paragraph every project's AI gets about automations. */
export const AUTOMATION_INSTRUCTIONS = `

Automations (things that happen after a record is saved — notify people, send an email, call a webhook, update or create a record): list_automations shows them, where the project's emails go out from and the people who can be notified; save_automation makes or changes one; test_automation tries one on a record without sending or writing anything; get_automation_runs reads what they did and why one failed. Describe the automation to the user in plain words — when it runs, its conditions, what each action does — and get their go-ahead before saving.`;
