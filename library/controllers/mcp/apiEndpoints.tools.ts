import ApiEndpoint, { ENDPOINT_ACTIONS } from '../../models/tenancy/apiEndpoint.model.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import {
	ACTION_LABEL,
	checkEndpoint,
	ensureEndpoints,
	newStandard,
	ruleFields,
	syncSummary,
} from '../../functions/apiEndpoints.function.js';
import { apiOrigin } from './website.tools.js';
import { findLogs, logSummary } from '../../functions/apiLogs.function.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * The API builder over MCP (docs/api-builder AB-05): the user's own AI lists a
 * project's endpoints, generates a model's standard ones, and makes or changes
 * an endpoint — its path, who may call it, rules, fields and a list's
 * settings — through the same checks as the panel (apiEndpoints.function
 * checkEndpoint). `set_public_api` stays for the model-level switch.
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string): Out => ({ text, isError: true });
const base = (req: any, caller: Caller) => `${apiOrigin(req)}/public/api/${caller.project?.publicSlug}`;
const WHO: Record<string, string> = { anyone: 'anyone', customer: 'signed-in customers', key: 'a server key' };

const ruleText = (c: any) => {
	const v = c.value && typeof c.value === 'object' && !Array.isArray(c.value) ? `{${c.value.ref}}` : JSON.stringify(c.value ?? '');
	return c.op === 'empty' || c.op === 'filled' ? `${c.field} ${c.op}` : `${c.field} ${c.op} ${v}`;
};

const line = (e: any) => {
	const rules = [...(e.access?.when || []).map(ruleText), ...(e.action === 'list' ? (e.list?.filters || []).map((f: any) => `always ${ruleText(f)}`) : [])];
	return `- ${e.enabled ? '' : '(off) '}${e.method} ${e.path} — ${e.name}; ${WHO[e.access?.who] || 'anyone'}${rules.length ? `; rules: ${rules.join(', ')}` : ''}${
		e.fields?.out?.length ? `; sends back: ${e.fields.out.join(', ')}` : ''
	}${e.fields?.readOnly?.length ? `; never writes: ${e.fields.readOnly.join(', ')}` : ''} [id ${e._id}]`;
};

const listEndpoints = async (req: any, _args: any, caller: Caller): Promise<Out> => {
	await ensureEndpoints();
	const [eps, defs]: any[] = await Promise.all([
		ApiEndpoint.find({}).sort({ model: 1, standard: -1, path: 1 }).lean(),
		ModelDefinition.find({ active: { $ne: false } }, { route: 1, name: 1, title: 1, fields: 1 }).lean(),
	]);
	const lines = [`The API is at ${base(req, caller)} — every path below is under it. Manage it in the panel: ${caller.link('/public-api/endpoints')}`];
	for (const d of defs) {
		const mine = eps.filter((e: any) => e.model === d.route);
		lines.push('', `${d.title || d.name} (${d.route})${mine.length ? '' : ' — not on the API'}`, ...mine.map(line));
		lines.push(`  rule fields: ${ruleFields(d).map(f => `${f.key} (${f.kind})`).join(', ')}`);
	}
	return {
		text: lines.join('\n'),
		data: {
			base: base(req, caller),
			endpoints: eps.map((e: any) => ({ _id: String(e._id), name: e.name, model: e.model, action: e.action, method: e.method, path: e.path, standard: !!e.standard, enabled: e.enabled !== false, access: e.access, fields: e.fields, list: e.list })),
		},
	};
};

const generateEndpoints = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const q = String(args?.model || '').trim();
	const def: any = q ? await ModelDefinition.findOne({ $or: [{ name: q }, { route: q.toLowerCase() }], active: { $ne: false } }).lean() : null;
	if (!def) return refuse(`No model “${args?.model}” in this project — list_models shows them.`);
	const actions: string[] = (Array.isArray(args?.actions) && args.actions.length ? args.actions : ['list', 'get']).filter((a: any) => (ENDPOINT_ACTIONS as readonly string[]).includes(a));
	const who = ['anyone', 'customer', 'key'].includes(args?.who) ? args.who : 'anyone';
	const auth = { anyone: 'none', customer: 'customer', key: 'key' }[who as 'anyone'] as any;
	await ensureEndpoints();
	const out: string[] = [];
	for (const action of actions) {
		const existing: any = await ApiEndpoint.findOne({ model: def.route, action, standard: true }).lean();
		if (existing) {
			if (!existing.enabled) await ApiEndpoint.updateOne({ _id: existing._id }, { $set: { enabled: true } });
			out.push(`${existing.enabled ? 'already there' : 'turned on'}: ${existing.method} ${existing.path}`);
			continue;
		}
		try {
			const e: any = await ApiEndpoint.create({ ...newStandard(def, action, { auth, ownerOnly: false, readOnlyFields: [] }), createdBy: caller.user?._id });
			out.push(`made: ${e.method} ${e.path} (${ACTION_LABEL[action]}, ${WHO[who]})`);
		} catch (err: any) {
			if (err?.code !== 11000) throw err;
			out.push(`skipped ${action}: a custom endpoint answers at its address`);
		}
	}
	await syncSummary(def.route);
	return { text: [`${def.title || def.name} on the API (${base(req, caller)}):`, ...out.map(l => `- ${l}`), 'Set rules and fields with save_endpoint (list_endpoints shows the ids).'].join('\n') };
};

const saveEndpoint = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const input = {
		name: args?.name,
		note: args?.note,
		model: args?.model,
		action: args?.action,
		path: args?.path,
		enabled: args?.enabled,
		access: args?.who || args?.rules || args?.match ? { who: args?.who, when: args?.rules, match: args?.match } : undefined,
		fields: args?.sendBack || args?.write || args?.readOnly ? { out: args?.sendBack, write: args?.write, readOnly: args?.readOnly } : undefined,
		list: args?.list,
	};
	let current: any = null;
	if (args?.id) {
		current = await ApiEndpoint.findById(String(args.id)).lean().catch(() => null);
		if (!current) return refuse(`No endpoint ${args.id} — list_endpoints shows them.`);
		// Left out, what it has is kept.
		if (input.access) input.access = { who: input.access.who ?? current.access?.who, when: input.access.when ?? current.access?.when, match: input.access.match ?? current.access?.match };
		if (input.fields) input.fields = { out: input.fields.out ?? current.fields?.out, write: input.fields.write ?? current.fields?.write, readOnly: input.fields.readOnly ?? current.fields?.readOnly };
		if (input.list) input.list = { ...current.list, ...input.list };
	}
	let checked: any;
	try {
		checked = await checkEndpoint(input, current || undefined);
	} catch (e: any) {
		return refuse(`${e?.extra?.on ? `${e.extra.on}: ` : ''}${e?.message || 'That endpoint isn’t valid'}`);
	}
	const { doc } = checked;
	try {
		if (current) await ApiEndpoint.updateOne({ _id: current._id }, { $set: { ...doc, updatedBy: caller.user?._id } });
		else current = (await ApiEndpoint.create({ ...doc, standard: false, createdBy: caller.user?._id, updatedBy: caller.user?._id })).toObject();
	} catch (e: any) {
		if (e?.code === 11000) return refuse(`path: another endpoint already answers ${doc.method} ${doc.path}`);
		throw e;
	}
	await syncSummary(doc.model);
	const saved: any = await ApiEndpoint.findById(current._id).lean();
	return {
		text: [`Saved — ${base(req, caller)}${saved.path}`, line(saved), `In the panel: ${caller.link(`/public-api/endpoints/${saved._id}`)}`].join('\n'),
		data: { _id: String(saved._id), method: saved.method, path: saved.path, url: `${base(req, caller)}${saved.path}` },
	};
};

const CONDITION = {
	type: 'object',
	required: ['field', 'op'],
	properties: {
		field: { type: 'string', description: 'A field key from list_endpoints’ rule fields; `_customer` is the owner (the customer who created it through the API)' },
		op: { type: 'string', enum: ['is', 'not', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'filled'] },
		value: {
			description:
				'The value to compare with (a list for "in"; none for empty/filled) — or, on an endpoint for signed-in customers, {"ref": "customer"} (the customer, for `_customer`) or {"ref": "customer.email" | "customer.name" | "customer.phone"}',
		},
	},
};

/** The API's request log (AB-06): the numbers over a period and the matching calls, newest first. */
const apiLogs = async (_req: any, args: any, caller: Caller): Promise<Out> => {
	const hours = [1, 24, 168].includes(Number(args?.hours)) ? Number(args.hours) : 24;
	const q = { ...args, hours, limit: Math.min(Number(args?.limit) || 30, 100) };
	const [sum, page] = await Promise.all([logSummary(q), findLogs(q)]);
	const period = hours === 1 ? 'the last hour' : hours === 24 ? 'the last 24 hours' : 'the last 7 days';
	const lines = [
		`${period}: ${sum.total} calls, ${sum.errors} failed${sum.avgMs != null ? `, typically ${sum.avgMs} ms (95% under ${sum.p95Ms} ms)` : ''}. Logs in the panel: ${caller.link('/public-api/logs')}`,
	];
	if (sum.topErrors.length) lines.push('', 'Commonest errors:', ...sum.topErrors.map((e: any) => `- ${e.status}${e.code ? ` ${e.code}` : ''}: ${e.error || '(no message)'}${e.endpoint ? ` — ${e.endpoint}` : ''} ×${e.count}`));
	lines.push('', page.doc.length ? 'Calls, newest first:' : 'No calls match.');
	for (const c of page.doc) {
		const who = c.key ? `key “${c.key.name}”` : c.customer ? `customer ${c.customer.email}` : 'anyone';
		lines.push(
			`- ${new Date(c.at).toISOString()} ${c.method} ${c.path}${c.query ? `?${c.query}` : ''} → ${c.status} in ${c.ms} ms; ${who}${c.endpoint ? `; endpoint ${c.endpoint.name} [${c.endpoint._id}]` : ''}${
				c.error ? `; error: ${c.error}${c.code ? ` (${c.code})` : ''}` : ''
			}${c.origin ? `; from ${c.origin}` : ''}`
		);
	}
	if (page.hasMore) lines.push(`(more — pass before: "${page.doc[page.doc.length - 1]._id}")`);
	return { text: lines.join('\n'), data: { summary: sum, calls: page.doc, hasMore: page.hasMore } };
};

export const API_ENDPOINT_TOOLS: ToolDef[] = [
	{
		name: 'list_endpoints',
		title: 'List the API’s endpoints',
		description:
			'The project’s public API as endpoints: each model’s endpoints (method, path, who may call it, its rules, fields sent back and never written, on/off, id) and the fields a rule can name. Call it before generate_endpoints or save_endpoint.',
		scope: 'read',
		only: 'project',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: listEndpoints,
	},
	{
		name: 'generate_endpoints',
		title: 'Generate a model’s endpoints',
		description:
			'A model’s standard endpoints at its own address (/<route> for list and create, /<route>/:id for get, update and delete), for `who`: "anyone", "customer" (signed-in customers) or "key" (a server key — for the business’s own server). Endpoints it has already are kept (turned on if off). Show the user what you’ll make first.',
		scope: 'build',
		only: 'project',
		inputSchema: {
			type: 'object',
			required: ['model'],
			properties: {
				model: { type: 'string', description: 'The model’s name or route' },
				actions: { type: 'array', items: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] }, description: 'Default list and get' },
				who: { type: 'string', enum: ['anyone', 'customer', 'key'] },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: generateEndpoints,
	},
	{
		name: 'save_endpoint',
		title: 'Make or change an endpoint',
		description:
			'One endpoint: with `id`, changes that endpoint (what’s left out is kept; a standard endpoint keeps its model, action and path); without it, makes a custom one — `model`, `action` and `path` (lowercase parts with dashes, 1–4 of them, ending in /:id for get/update/delete; not starting with auth, site, pages, shop, cart, checkout, render, track, widgets, payments). `who` decides who may call it; `rules` narrow the records it reaches (a create must meet them, or it’s refused); `sendBack` lists the fields in its answers (default all); `readOnly` the fields a create/update never writes; `list` a list’s settings. Tell the user the endpoint and its rules in plain words before saving.',
		scope: 'build',
		only: 'project',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'The endpoint to change (from list_endpoints); leave out to make a new one' },
				model: { type: 'string', description: 'The model’s route (new endpoints)' },
				action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] },
				path: { type: 'string', description: 'e.g. /products/featured or /my/orders/:id' },
				name: { type: 'string' },
				note: { type: 'string', description: 'What the site or app uses it for — shown in the reference' },
				enabled: { type: 'boolean' },
				who: { type: 'string', enum: ['anyone', 'customer', 'key'] },
				rules: { type: 'array', items: CONDITION, description: 'Which records it reaches; [] for none' },
				match: { type: 'string', enum: ['all', 'any'] },
				sendBack: { type: ['array', 'null'], items: { type: 'string' }, description: 'Field keys in its answers; null for all' },
				write: { type: ['array', 'null'], items: { type: 'string' }, description: 'Field keys a create/update may write; null for all' },
				readOnly: { type: 'array', items: { type: 'string' }, description: 'Field keys a create/update never writes (the business sets them)' },
				list: {
					type: 'object',
					properties: {
						filters: { type: 'array', items: CONDITION, description: 'Always applied, on top of the rules' },
						callerFilters: { type: 'boolean', description: 'Callers may add filters, search and sort (default true)' },
						sort: { type: 'string', description: 'Default order: a field, "-" for descending, e.g. -createdAt' },
						limit: { type: 'number' },
						maxLimit: { type: 'number', description: 'Up to 100' },
					},
				},
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: saveEndpoint,
	},
	{
		name: 'get_api_logs',
		title: 'Read the API’s request logs',
		description:
			'The calls made to the project’s API (kept 7 days), newest first, with the numbers for the period: each call’s method, path and query, status, time, the endpoint that answered, who called (anyone, a signed-in customer, a server key), the error message the caller got, and the calling site. Filter to find why something fails: status "errors" (or "4xx", "5xx", a code), an endpoint id (from list_endpoints), method, who, q (text in the path, query, error or customer email). Never shows bodies, tokens or IP addresses.',
		scope: 'read',
		only: 'project',
		inputSchema: {
			type: 'object',
			properties: {
				hours: { type: 'number', enum: [1, 24, 168], description: 'The period; default 24' },
				status: { type: 'string', description: 'ok, errors, 4xx, 5xx, or a status code like 401' },
				endpoint: { type: 'string', description: 'An endpoint id, or "none" for calls no endpoint answered (sign-in, cart, unknown paths)' },
				method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
				who: { type: 'string', enum: ['anyone', 'customer', 'key'] },
				q: { type: 'string', description: 'Text to look for' },
				limit: { type: 'number', description: 'Calls to list, up to 100 (default 30)' },
				before: { type: 'string', description: 'Continue after this call id' },
			},
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: apiLogs,
	},
];

/** The paragraph every project's AI gets about the API. */
export const API_ENDPOINT_INSTRUCTIONS = `

For the project's API (what its own website, app or server calls): list_endpoints shows every endpoint; get_api_logs reads the calls made to it (find why a call fails: status "errors"); generate_endpoints makes a model's standard ones; save_endpoint makes a custom endpoint (its own path) or changes one — who may call it (anyone, signed-in customers, a server key), rules on the records it reaches, the fields it sends back and never writes, a list's fixed filters and page sizes. Server keys are made by the user in the panel (API → Keys), never by you. Describe each endpoint and its rules to the user in plain words and get their go-ahead before saving.`;
