import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Admin } from '../../../imports.js';
import { listModelFields, scopedModel } from '../../functions/routeRegistry.function.js';
import { isAccessRestricted } from '../../functions/recordAccess.function.js';
import { ApiKey } from '../../models/builder/_index.js';
import SidebarCategory from '../../models/sidebarcategories/model.js';
import { syncDynamicModels } from '../../functions/dynamicModels.function.js';
import { BuildError } from '../builder/models.controller.js';
import { hashKey } from '../builder/features.controller.js';
import { buildFeature, modelCatalog, planFeature, planProblems, FeaturePlan, Step } from '../builder/features.service.js';
import { FEATURE_SCHEMA, catalogText, planFromAi, platformGuide } from '../builder/features.schema.js';
import { effectiveConfig, effectiveSettings, publishConfigPatch, routeModel, routePermission } from '../builder/builder.controller.js';
import { PROTECTED_ROUTES } from '../builder/validate.js';
import { runInScope, TenantScope } from '../../functions/tenantScope.function.js';
import DashboardConfig from '../../models/builder/dashboardConfig.model.js';
import { normalizeWidget } from '../dashboard/dashboard.controller.js';
import { namingFields, refIds } from './records.helpers.js';
import { WEBSITE_INSTRUCTIONS, WEBSITE_TOOLS, setPublicApi } from './website.tools.js';

/**
 * /mcp — the Model Context Protocol endpoint an admin's own AI connects to
 * (Claude Desktop, claude.ai, ChatGPT, Claude Code, Cursor…), so it can plan
 * a whole feature with the user and build it here: the models, their links,
 * the pages and the sidebar, through the same checks and build as the admin's
 * feature wizard (builder/features.service.ts).
 *
 * Streamable HTTP, stateless: every POST carries JSON-RPC and gets JSON back;
 * there's no server-sent stream (GET answers 405, which the spec allows).
 *
 * Auth is an API key (Settings → API & MCP in the admin), acting as the admin
 * who made it and never beyond their role:
 *   - `Authorization: Bearer emk_…` for clients that send headers, or
 *   - the key in the path, `/mcp/emk_…`, for connectors that only take a URL
 *     (claude.ai and ChatGPT without OAuth). This router is mounted before
 *     the request logger, so the key doesn't land in the logs.
 */

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'e-mint', title: 'e-mint admin builder', version: '1.0.0' };

const adminUrl = (path = '') => `${(process.env.ADMIN_FRONTEND_URL || process.env.ADMIN_URL || '').replace(/\/$/, '')}${path}`;

const INSTRUCTIONS = `This server builds features in the user's e-mint admin panel: data models, the links between them, and their pages (table, filters, form, detail page with tabs, sidebar entry).

How to work with the user:
1. Call describe_platform once, then list_models to see what already exists. Reuse existing models — link to them rather than recreating them.
2. Draft the whole feature as a plan and check it with plan_feature (it writes nothing).
3. Walk the user through the plan ONE STEP AT A TIME. For each step say what you suggest and why (its rationale). For a new model show its fields as a short table (label, kind, required, links). For an existing model show ONLY what changes: the fields added or changed, and the tabs added to its page. Ask them to confirm or change it before moving to the next step. Apply their edits and re-check with plan_feature.
4. After the last step, show a short summary — the models, how they link, where they go in the sidebar — and ask for the go-ahead.
5. Only then call build_feature with the confirmed plan. Share the page links it returns.
Use update_page for later changes to a page's columns, form or detail layout, or to turn its Bulk upload on. For the home page's dashboard — numbers, charts and recent records from the models — read it with get_dashboard, propose the widgets, and save with update_dashboard after the user agrees. With the key's "data" scope, query_records reads a page's records (read-only) for questions and analysis. Never build without the user's go-ahead.`;

/* ---------------------------------------------------------------- auth */

/**
 * Who a request acts as. `page`/`link` make the links tools hand back (the
 * admin panel's, or the tenant panel's); `allows` is the permission rule (the
 * admin role's, or the organization role's); `scope` runs the request inside a
 * tenant project (docs/multi-tenancy WO-10).
 */
type Caller = {
	user: any;
	permissions: string[];
	key: any;
	page: (route: string) => string;
	link: (path: string) => string;
	allows: (permission: string) => boolean;
	/** The builder permission, for the read and build scopes. */
	builder: (scope: 'read' | 'build') => boolean;
	scope?: TenantScope;
	/** The tenant project the key belongs to (none on the admin MCP). */
	project?: any;
};

const authenticate = async (req: Request): Promise<Caller | { error: string }> => {
	const header = String(req.headers.authorization || '');
	const secret = (req.params as any).key || (header.startsWith('Bearer ') ? header.slice(7).trim() : '');
	if (!secret || !secret.startsWith('emk_')) return { error: 'An e-mint API key is required (Settings → API & MCP)' };
	const key: any = await ApiKey.findOne({ hash: hashKey(secret) });
	if (!key || key.revokedAt) return { error: 'This API key was revoked or doesn’t exist' };
	if (key.expiresAt && key.expiresAt < new Date()) return { error: 'This API key has expired' };
	const user: any = await Admin.findById(key.createdBy).select('-password').populate('role');
	if (!user || user.isActive === false || user.isDeleted === true) return { error: 'The admin who made this key no longer has access' };
	if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000)
		await ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } });
	const permissions: string[] = user.role?.permissions || [];
	const has = (p: string) => permissions.includes('*') || permissions.includes(p);
	return {
		user,
		permissions,
		key,
		page: route => adminUrl(`/${route}`),
		link: path => adminUrl(path),
		allows: has,
		builder: scope => (scope === 'read' ? has('view-builder') || has('edit-builder') : has('edit-builder')),
	};
};

const can = (c: Caller, scope: Scope) => {
	if (!c.key.scopes?.includes(scope)) return `This key doesn't have the “${scope}” scope`;
	// Records: each page's own view permission, checked by the tool.
	if (scope === 'data') return null;
	if (!c.builder(scope)) return `${c.user.name || 'The key’s owner'} doesn't have the builder permission`;
	return null;
};

/* --------------------------------------------------------------- tools */

type Scope = 'read' | 'build' | 'data';

type ToolDef = {
	name: string;
	title: string;
	description: string;
	scope: Scope;
	/** Only offered inside a tenant project, or a website project. */
	only?: 'project' | 'website';
	inputSchema: any;
	annotations: Record<string, boolean>;
	run: (req: any, args: any, caller: Caller) => Promise<{ text: string; data?: any; isError?: boolean }>;
};

const kindLine = (f: any) =>
	`| ${f.label || f.key} | \`${f.key}\` | ${f.kind}${f.ref ? ` → ${f.ref}` : ''}${f.options?.length ? ` (${f.options.map((o: any) => o.value).join(', ')})` : ''}${f.formula ? ` = ${f.formula}` : ''} | ${f.required ? 'yes' : ''} |`;

/** A plan as Markdown the AI can show step by step. */
const planText = (plan: FeaturePlan) => {
	const out: string[] = [`# ${plan.title || 'Feature'}`, plan.summary || ''];
	for (const s of plan.steps as Step[]) {
		out.push('', `## Step ${s.index + 1}: ${s.action === 'create' ? `new model ${s.title} (${s.name}, /${s.route})` : `change ${s.title} (${s.model})`}`);
		if (s.rationale) out.push(`Why: ${s.rationale}`);
		if (s.action === 'create') {
			out.push('', '| Field | Key | Kind | Required |', '|---|---|---|---|', ...s.fields.map(kindLine));
		} else {
			if (s.addFields.length) out.push('', 'Fields added:', '| Field | Key | Kind | Required |', '|---|---|---|---|', ...s.addFields.map(kindLine));
			if (s.changeFields.length)
				out.push('', 'Fields changed:', ...s.changeFields.map((f: any) => `- ${f.label || f.key} (\`${f.key}\`) — was ${JSON.stringify({ label: f.before?.label, required: !!f.before?.required, options: f.before?.options?.map((o: any) => o.value) })}`));
			if (!s.built && s.synthesized) out.push('(Defined in code — its fields stay as they are.)');
		}
		const tabs = s.tabs.filter(t => t.enabled);
		if (tabs.length) out.push('', `Tabs on its page: ${tabs.map(t => `“${t.title}” (${t.from}.${t.field})`).join(', ')}`);
		if (s.problems.length) out.push('', 'Problems:', ...s.problems.map(p => `- ${p}`));
	}
	if (plan.relations.length) out.push('', '## Links', ...plan.relations.map(r => `- ${r.from}.${r.field} → ${r.to}${r.many ? ' (many)' : ''}`));
	if (plan.problems.length) out.push('', '## Problems', ...plan.problems.map(p => `- ${p}`));
	out.push('', plan.ok ? 'The plan is valid. Walk the user through it step by step before building.' : 'Fix the problems and check again.');
	return out.join('\n');
};

/**
 * update_page's `bulkUpload`, tidied: false (off), true (on), or the options
 * the importer reads (importRows.controller.ts `uploadOptions`). Field keys
 * go through `known`, which collects the unknown ones. A string is a problem.
 */
const bulkUploadOf = (v: any, known: (k: any) => boolean): any => {
	if (v === false || v === null) return false;
	if (v === true) return true;
	if (typeof v !== 'object' || Array.isArray(v)) return 'bulkUpload must be true, false or an options object';
	const out: any = {};
	if (v.title) out.title = String(v.title).slice(0, 60);
	if (v.maxRows !== undefined) {
		const n = Number(v.maxRows);
		if (!Number.isInteger(n) || n < 1 || n > 50000) return 'bulkUpload.maxRows must be a whole number from 1 to 50000';
		out.maxRows = n;
	}
	if (v.columns !== undefined) {
		if (typeof v.columns !== 'object' || Array.isArray(v.columns)) return 'bulkUpload.columns must map a file’s column names to field keys';
		const entries = Object.entries(v.columns).filter(([h, k]) => String(h).trim() && known(k));
		if (entries.length) out.columns = Object.fromEntries(entries.map(([h, k]) => [String(h).trim(), k]));
	}
	if (v.missing !== undefined) {
		const codes = (Array.isArray(v.missing) ? v.missing : [v.missing]).map((c: any) => String(c).trim()).filter(Boolean);
		if (codes.length) out.missing = [...new Set(codes)].slice(0, 20);
	}
	if (v.missingFlag) {
		if (!out.missing) return 'bulkUpload.missingFlag needs missing codes to react to';
		if (known(v.missingFlag)) out.missingFlag = v.missingFlag;
	}
	if (v.matchOn !== undefined) {
		const list = (Array.isArray(v.matchOn) ? v.matchOn : []).filter(known);
		if (list.length) out.matchOn = [...new Set(list)];
	}
	return Object.keys(out).length ? out : true;
};

/* -------------------------------------------------------- query_records */

const MAX_RECORDS = 500;
const OPS: Record<string, string> = { gt: '$gt', gte: '$gte', lt: '$lt', lte: '$lte', ne: '$ne', in: '$in', nin: '$nin' };

/**
 * Reads the records of one page for the user's AI: the same records the
 * key's owner may see in the admin table (view-<route>; archived rows hidden),
 * never secret-named or hidden fields, linked records shown by their names.
 * Pages with per-record access (owner / private / shared) are refused for now.
 */
const queryRecords = async (req: any, args: any, caller: Caller) => {
	const route = String(args?.route || '').trim();
	const Model: mongoose.Model<any> | null = route ? routeModel(req.app, route) : null;
	const permission = route ? routePermission(req.app, route) : null;
	if (!Model || !permission) return { text: `No table page at /${route}. Call list_models for routes.`, isError: true };
	if (PROTECTED_ROUTES.has(route)) return { text: `/${route} controls access — its records can't be read here.`, isError: true };
	if (!caller.allows(`view-${permission}`))
		return { text: `${caller.user.name || 'The key’s owner'} can't view /${route} (needs view-${permission}).`, isError: true };
	if (isAccessRestricted(Model)) return { text: `/${route} has per-record access (owner, private, shared) — its records can't be read over MCP yet.`, isError: true };

	const settings = await effectiveSettings(req.app, route);
	const excluded = new Set((settings?.fields || []).filter((f: any) => f.exclude).map((f: any) => f.key));
	const fields = listModelFields(Model).filter(f => !f.key.includes('.') && !excluded.has(f.key) && f.key !== '__v');
	const byKey = new Map(fields.map(f => [f.key, f]));
	for (const k of ['createdAt', 'updatedAt']) if (Model.schema.path(k) && !byKey.has(k)) byKey.set(k, { key: k, instance: 'Date' } as any);

	/* The filter: field → value, list of values, or { gte, lte, ne, in… }. */
	const query: any = { archivedAt: null };
	const unknown: string[] = [];
	for (const [key, raw] of Object.entries<any>(args?.filter && typeof args.filter === 'object' ? args.filter : {})) {
		const f: any = byKey.get(key);
		if (!f) {
			unknown.push(key);
			continue;
		}
		// A definition names its link targets plainly ('Client'); in a project that's its own model, never the platform's.
		const Ref = f.ref ? scopedModel(f.ref) : null;
		const values = async (v: any) => (Ref ? refIds(Ref, [].concat(v)) : [].concat(v));
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const cond: any = {};
			for (const [op, v] of Object.entries<any>(raw)) {
				if (!OPS[op]) return { text: `Unknown operator “${op}” on ${key} — use ${Object.keys(OPS).join(', ')}`, isError: true };
				cond[OPS[op]] = op === 'in' || op === 'nin' ? await values(v) : Ref ? (await values(v))[0] ?? null : v;
			}
			query[key] = cond;
		} else if (Array.isArray(raw)) query[key] = { $in: await values(raw) };
		else query[key] = Ref ? { $in: await values(raw) } : raw;
	}

	const want = Array.isArray(args?.fields) ? args.fields.filter((k: any) => byKey.has(k)) : [...byKey.keys()];
	const limit = Math.min(Math.max(parseInt(args?.limit, 10) || 100, 1), MAX_RECORDS);
	const page = Math.max(parseInt(args?.page, 10) || 1, 1);
	const sortKey = String(args?.sort || '-createdAt');
	const sort = byKey.has(sortKey.replace(/^-/, '')) ? { [sortKey.replace(/^-/, '')]: sortKey.startsWith('-') ? -1 : 1 } : { createdAt: -1 };

	let find = Model.find(query).select(want.join(' ')).sort(sort as any).skip((page - 1) * limit).limit(limit);
	for (const k of want) {
		const f: any = byKey.get(k);
		const Ref = f?.ref ? scopedModel(f.ref) : null;
		if (Ref) find = find.populate({ path: k, select: namingFields(Ref).join(' ') || '_id' });
	}
	let rows: any[];
	let total: number;
	try {
		[rows, total] = await Promise.all([find.lean(), Model.countDocuments(query)]);
	} catch (e: any) {
		return { text: `A filter doesn’t fit its field: ${e.message}`, isError: true };
	}
	const pages = Math.ceil(total / limit) || 1;
	const head = `/${route}: ${total.toLocaleString()} record${total === 1 ? '' : 's'} match${page < pages ? ` — page ${page} of ${pages}, ${rows.length} shown (ask for page ${page + 1})` : `, ${rows.length} on this page`}.`;
	const notes = unknown.length ? `\nIgnored filters (not fields of this page): ${unknown.join(', ')}` : '';
	return { text: `${head}${notes}\n${JSON.stringify(rows)}`, data: { route, total, page, pages, limit, records: rows } };
};

/** build_feature's plan: a project's new model can have its public API switched on as it's built (WO-33). */
const STEP: any = FEATURE_SCHEMA.properties.steps.items;
const BUILD_SCHEMA = {
	...FEATURE_SCHEMA,
	properties: {
		...FEATURE_SCHEMA.properties,
		steps: {
			...FEATURE_SCHEMA.properties.steps,
			items: {
				...STEP,
				properties: {
					...STEP.properties,
					publicApi: {
						type: 'object',
						description:
							'create, in a project only: switch the model’s public API on as it’s built — e.g. {"enabled": true, "actions": ["list", "get"]} for a list a website shows. auth "customer" for signed-in customers only.',
						properties: {
							enabled: { type: 'boolean' },
							actions: { type: 'array', items: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] } },
							auth: { type: 'string', enum: ['none', 'customer'] },
							ownerOnly: { type: 'boolean' },
						},
					},
				},
			},
		},
	},
};

const TOOLS: ToolDef[] = [
	{
		name: 'describe_platform',
		title: 'How building works here',
		description: 'The field kinds, naming rules and conventions for designing models in this admin. Read once before planning.',
		scope: 'read',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async () => ({ text: `${platformGuide()}\n\nPlan shape: see the plan_feature tool's input schema.` }),
	},
	{
		name: 'list_models',
		title: 'List models',
		description: 'Every model in the admin — its name, page title, route, whether it was built in the model builder (fields can be added) or defined in code (fixed), and its fields.',
		scope: 'read',
		inputSchema: { type: 'object', properties: { search: { type: 'string', description: 'Only models whose name or title contains this' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (req, args) => {
			const q = String(args?.search || '').toLowerCase();
			const catalog = (await modelCatalog(req.app)).filter(c => !q || c.name.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
			return { text: catalogText(catalog) || 'No models match.', data: { models: catalog.map(({ fields, ...c }) => ({ ...c, fields: fields.length })) } };
		},
	},
	{
		name: 'get_model',
		title: 'Get a model',
		description: 'One model in detail: its fields, its page (table columns, detail tabs) and the models that link to it.',
		scope: 'read',
		inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (req, args, caller) => {
			const name = String(args?.name || '').toLowerCase();
			const catalog = await modelCatalog(req.app);
			const m = catalog.find(c => c.name.toLowerCase() === name || c.title.toLowerCase() === name || c.route === name);
			if (!m) return { text: `No model named “${args?.name}”. Call list_models to see them.`, isError: true };
			const config = await effectiveConfig(req.app, m.route);
			const linkedBy = catalog.flatMap(c => c.fields.filter((f: any) => f.ref === m.name).map((f: any) => `${c.name}.${f.key}`));
			const data = {
				...m,
				page: {
					url: caller.page(m.route),
					table: config?.table || [],
					tabs: (config?.viewTabs || []).map((t: any) => ({ title: t.title, related: t.related, field: t.foreignField || t.localField })),
				},
				linkedBy,
			};
			return {
				text: [
					`${m.name} — “${m.title}”, /${m.route}, ${m.built ? 'built in the model builder' : 'defined in code'}`,
					'| Field | Key | Kind | Required |',
					'|---|---|---|---|',
					...m.fields.map(kindLine),
					`Table columns: ${(data.page.table || []).join(', ') || '—'}`,
					`Tabs: ${data.page.tabs.map((t: any) => t.title).join(', ') || '—'}`,
					`Linked from: ${linkedBy.join(', ') || '—'}`,
				].join('\n'),
				data,
			};
		},
	},
	{
		name: 'list_sidebar_categories',
		title: 'List sidebar categories',
		description: 'The sidebar categories new pages can go in.',
		scope: 'read',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async () => {
			const cats: any[] = await SidebarCategory.find({}, { name: 1, description: 1 }).sort({ priority: 1, name: 1 }).lean();
			return { text: cats.map(c => `- ${c.name}`).join('\n') + '\n- new (a category named after the feature)', data: { categories: cats } };
		},
	},
	{
		name: 'query_records',
		title: 'Read records',
		description:
			'Reads the records of one table page, as its admin table would show them to the key’s owner (archived rows hidden, secret fields never included). Linked records come back with their names. Filter by field: a value, a list of values, or operators {gte, lte, gt, lt, ne, in, nin}; a linked field can be filtered by the linked record’s name or code (e.g. {"industry": "Mining"}). Up to 500 records per page — ask for the next page for more. Read-only; needs the key’s “data” scope.',
		scope: 'data',
		inputSchema: {
			type: 'object',
			required: ['route'],
			properties: {
				route: { type: 'string', description: 'The page’s route, e.g. "surveyfigures" (list_models shows them)' },
				filter: { type: 'object', description: 'Field key → value, [values] or {gte, lte, gt, lt, ne, in, nin}' },
				fields: { type: 'array', items: { type: 'string' }, description: 'Only these fields (default: all readable ones)' },
				sort: { type: 'string', description: 'A field key, "-" first for descending, e.g. "-year"' },
				limit: { type: 'integer', minimum: 1, maximum: MAX_RECORDS },
				page: { type: 'integer', minimum: 1 },
			},
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: queryRecords,
	},
	{
		name: 'plan_feature',
		title: 'Check a feature plan',
		description:
			'Checks a feature plan — new models, changes to existing ones, links and tabs — exactly as the build will, without writing anything. Returns each step as it would be built, and any problems to fix. Walk the user through the steps one at a time before building.',
		scope: 'read',
		inputSchema: { type: 'object', required: ['feature'], properties: { feature: FEATURE_SCHEMA } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (req, args) => {
			const plan = await planFeature(req, planFromAi(args?.feature));
			return { text: planText(plan), data: { ok: plan.ok, problems: planProblems(plan), plan }, isError: !plan.ok };
		},
	},
	{
		name: 'build_feature',
		title: 'Build a feature',
		description:
			'Builds a confirmed feature plan in the admin: creates the models, adds the fields to existing ones, adds the tabs and sidebar entries. All or nothing. Only call it after the user has confirmed every step.',
		scope: 'build',
		inputSchema: { type: 'object', required: ['feature'], properties: { feature: BUILD_SCHEMA } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: async (req, args, caller) => {
			try {
				const r = await buildFeature(req, planFromAi(args?.feature), { source: 'mcp', apiKey: caller.key });
				// Public APIs asked for on new models — a project's only. Created models come back in step order.
				const creates = (Array.isArray(args?.feature?.steps) ? args.feature.steps : []).filter((s: any) => s?.action !== 'update');
				const apis: string[] = [];
				for (let i = 0; i < creates.length; i++) {
					if (!creates[i]?.publicApi || !r.created[i]) continue;
					if (!caller.scope) {
						r.warnings.push(`${r.created[i].title}: the public API is for project models only`);
						continue;
					}
					const set = await setPublicApi(req, r.created[i].name, creates[i].publicApi);
					if (set.error) r.warnings.push(`${r.created[i].title}'s public API: ${set.error}`);
					else apis.push(`- Public API on: ${r.created[i].title} (${set.value.actions.join(', ')}) — /${r.created[i].route}`);
				}
				const lines = [
					`Built “${r.feature.title}”.`,
					...r.created.map(c => `- New: ${c.title} — ${caller.page(c.route)} (model: ${caller.link(`/model-builder/${c.id}`)})`),
					...r.updated.map(u => `- Changed: ${u.title} — added ${u.added.join(', ') || 'nothing'}${u.changed.length ? `; changed ${u.changed.join(', ')}` : ''}`),
					...r.tabs.map(t => `- Tab “${t.title}” on the ${t.page} page`),
					...apis,
					...r.warnings.map(w => `- Note: ${w}`),
				];
				return { text: lines.join('\n'), data: { ...r, feature: { id: String(r.feature._id), title: r.feature.title } } };
			} catch (e: any) {
				if (e instanceof BuildError) return { text: [e.message, ...(e.problems || []).map(p => `- ${p}`)].join('\n'), isError: true };
				throw e;
			}
		},
	},
	{
		name: 'update_page',
		title: 'Change a page layout',
		description:
			'Changes an existing page: its table columns, create/edit form sections, detail-page sections, add-button title, or Bulk upload (on/off and its options). Published straight away (a version is kept in the route builder). Field keys must be the model’s.',
		scope: 'build',
		inputSchema: {
			type: 'object',
			required: ['route'],
			properties: {
				route: { type: 'string', description: 'The page’s route, e.g. "leaverequests"' },
				table: { type: 'array', items: { type: 'string' }, description: 'Column keys, in order' },
				form: (FEATURE_SCHEMA as any).properties.steps.items.properties.form,
				view: (FEATURE_SCHEMA as any).properties.steps.items.properties.view,
				buttonTitle: { type: 'string' },
				bulkUpload: {
					description:
						'The table’s Bulk upload (Excel, CSV or JSON files, every row checked, all or nothing): false to turn it off, true to turn it on, or options — `columns` maps a file’s column names to field keys ({"rme_size_grp": "sizeBand"}); `missing` lists cell values read as empty in number, date and yes/no columns (["C", ".."]); `missingFlag` is a yes/no field ticked on rows that had one; `matchOn` lists fields that together identify a record, so a row matching an existing record (or another row) is refused; `maxRows` (up to 50000, default 2000); `title` names the menu item.',
					anyOf: [
						{ type: 'boolean' },
						{
							type: 'object',
							properties: {
								title: { type: 'string' },
								maxRows: { type: 'integer', minimum: 1, maximum: 50000 },
								columns: { type: 'object', additionalProperties: { type: 'string' } },
								missing: { type: 'array', items: { type: 'string' } },
								missingFlag: { type: 'string' },
								matchOn: { type: 'array', items: { type: 'string' } },
							},
						},
					],
				},
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: async (req, args, caller) => {
			const route = String(args?.route || '').trim();
			if (!route || !routeModel(req.app, route)) return { text: `No page at /${route}. Call list_models for routes.`, isError: true };
			if (PROTECTED_ROUTES.has(route)) return { text: `/${route} controls access and can't be changed here.`, isError: true };
			const settings = await effectiveSettings(req.app, route);
			const keys = new Set<string>([...(settings?.fields || []).map((f: any) => f.key), 'createdAt']);
			const bad: string[] = [];
			const known = (k: any) => (typeof k === 'string' && keys.has(k) ? true : (bad.push(String(k)), false));
			let upload: any;
			if (args?.bulkUpload !== undefined) {
				upload = bulkUploadOf(args.bulkUpload, known);
				if (typeof upload === 'string') return { text: upload, isError: true };
			}
			try {
				await publishConfigPatch(
					req,
					route,
					data => {
						const next = { ...data };
						if (Array.isArray(args.table)) next.table = [...new Set(args.table.filter(known))];
						if (Array.isArray(args.form))
							next.form = args.form
								.map((s: any) => ({
									sectionTitle: String(s?.sectionTitle || ''),
									...(s?.description && { description: String(s.description) }),
									fields: (Array.isArray(s?.fields) ? s.fields : [])
										.map((row: any) => (Array.isArray(row) ? row.filter(known) : known(row) ? row : null))
										.filter((row: any) => row && (!Array.isArray(row) || row.length)),
								}))
								.filter((s: any) => s.fields.length);
						if (Array.isArray(args.view))
							next.view = args.view
								.map((s: any) => ({
									title: String(s?.title || ''),
									columns: [1, 2, 3].includes(s?.columns) ? s.columns : 2,
									fields: (Array.isArray(s?.fields) ? s.fields : []).filter(known),
								}))
								.filter((s: any) => s.fields.length);
						if (args.buttonTitle) next.route = { ...(next.route || {}), button: { ...(next.route?.button || {}), title: String(args.buttonTitle).slice(0, 60) } };
						if (upload !== undefined) {
							const { bulkUpload, ...rest } = next.route || {};
							next.route = upload ? { ...rest, bulkUpload: upload } : rest;
						}
						return next;
					},
					'Changed by an AI client over MCP'
				);
			} catch (e: any) {
				return { text: e?.message || 'Could not change the page', isError: true };
			}
			return {
				text: `Updated /${route}: ${caller.page(route)}${bad.length ? `\nSkipped unknown keys: ${[...new Set(bad)].join(', ')}` : ''}`,
			};
		},
	},
	{
		name: 'get_dashboard',
		title: 'Read the dashboard',
		description: 'The home page’s widgets as saved in the dashboard builder (none saved: the default dashboard). Read it before update_dashboard.',
		scope: 'read',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async () => {
			const doc: any = await DashboardConfig.findOne({ key: 'default' }).lean();
			const widgets = doc?.widgets || [];
			return {
				text: widgets.length
					? `${widgets.length} widget(s):\n${JSON.stringify(widgets, null, 1)}`
					: 'No dashboard saved yet — update_dashboard makes one.',
				data: { widgets, saved: !!doc },
			};
		},
	},
	{
		name: 'update_dashboard',
		title: 'Change the dashboard',
		description:
			'Saves the home page’s widgets (the dashboard builder). Each widget reads one model (`route`, from list_models) under the viewer’s own permissions: "stat" a single number (count, or sum/avg of a number `field`, over a `range`, optionally compared with the period before); "chart" over time (group "time", `interval`) or broken down by a field (group "field", `by`: an options or linked field); "recent" the latest records with up to 6 `columns`. `mode` "replace" (default) saves exactly `widgets` — call get_dashboard first to keep what’s there — "append" adds them after the current ones. Show the user the plan first.',
		scope: 'build',
		inputSchema: {
			type: 'object',
			required: ['widgets'],
			properties: {
				mode: { type: 'string', enum: ['replace', 'append'] },
				widgets: {
					type: 'array',
					maxItems: 40,
					items: {
						type: 'object',
						required: ['type', 'route'],
						properties: {
							type: { type: 'string', enum: ['stat', 'chart', 'recent'] },
							route: { type: 'string', description: 'The model’s route' },
							title: { type: 'string' },
							size: { type: 'string', enum: ['sm', 'md', 'lg', 'xl', 'full'], description: 'Width: sm a quarter … full the whole row' },
							metric: { type: 'string', enum: ['count', 'sum', 'avg'] },
							field: { type: 'string', description: 'The number field for sum/avg' },
							range: { type: 'string', enum: ['all', 'today', '7d', '30d', '90d', 'month', '12m', 'year'] },
							dateField: { type: 'string', description: 'The date the range applies to (default createdAt)' },
							compare: { type: 'boolean', description: 'stat: show the change from the period before' },
							prefix: { type: 'string', description: 'e.g. "$"' },
							suffix: { type: 'string' },
							group: { type: 'string', enum: ['time', 'field'] },
							chart: { type: 'string', enum: ['bar', 'line', 'donut'] },
							interval: { type: 'string', enum: ['day', 'week', 'month'] },
							by: { type: 'string', description: 'chart by field: the field to break down by' },
							limit: { type: 'integer', description: 'chart by field: bars (2–12); recent: rows (1–20)' },
							columns: { type: 'array', items: { type: 'string' }, description: 'recent: field keys to show' },
							sort: { type: 'string', description: 'recent: e.g. "-createdAt"' },
							filters: {
								type: 'array',
								items: {
									type: 'object',
									required: ['field', 'value'],
									properties: { field: { type: 'string' }, op: { type: 'string', enum: ['eq', 'ne', 'in'] }, value: {} },
								},
							},
						},
					},
				},
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: async (req, args, caller) => {
			const incoming = Array.isArray(args?.widgets) ? args.widgets : null;
			if (!incoming) return { text: 'Send the widgets as a list.', isError: true };
			const current: any = await DashboardConfig.findOne({ key: 'default' }).lean();
			const list = args?.mode === 'append' ? [...(current?.widgets || []), ...incoming] : incoming;
			if (list.length > 40) return { text: 'A dashboard holds up to 40 widgets.', isError: true };

			const problems: string[] = [];
			const widgets: any[] = [];
			const fieldsOf = new Map<string, Set<string>>();
			for (let i = 0; i < list.length; i++) {
				const { widget, error } = normalizeWidget(list[i], i);
				if (error) {
					problems.push(error);
					continue;
				}
				// The model and the fields it names must be this panel's — the builder's form only offers those.
				if (!fieldsOf.has(widget.route)) {
					if (!routeModel(req.app, widget.route)) {
						problems.push(`Widget ${i + 1}: no model at /${widget.route} — call list_models for routes`);
						continue;
					}
					const settings = await effectiveSettings(req.app, widget.route);
					fieldsOf.set(widget.route, new Set([...(settings?.fields || []).map((f: any) => f.key), '_id', 'code', 'createdAt', 'updatedAt']));
				}
				const keys = fieldsOf.get(widget.route)!;
				const named = [widget.field, widget.by, widget.dateField, ...(widget.columns || []), ...(widget.filters || []).map((f: any) => f.field)]
					.concat(widget.sort ? [String(widget.sort).replace(/^-/, '')] : [])
					.filter(Boolean);
				const unknown = [...new Set(named.filter((k: string) => !keys.has(k.split('.')[0])))];
				if (unknown.length) problems.push(`Widget ${i + 1} (/${widget.route}): unknown field ${unknown.join(', ')}`);
				else widgets.push(widget);
			}
			if (problems.length) return { text: `Nothing saved:\n- ${problems.join('\n- ')}`, isError: true };

			const seen = new Set<string>();
			widgets.forEach((w, i) => {
				if (seen.has(w.id)) w.id = `${w.id}-${i}`;
				seen.add(w.id);
			});
			await DashboardConfig.findOneAndUpdate({ key: 'default' }, { $set: { widgets, updatedBy: caller.user._id } }, { upsert: true });
			return { text: `Saved the dashboard: ${widgets.length} widget(s). ${caller.link('/')}`, data: { widgets } };
		},
	},
	...WEBSITE_TOOLS,
];

/** Whether a tool is offered to this caller: some only make sense in a project, or a website project. */
const available = (t: ToolDef, caller: Caller) =>
	!t.only || (t.only === 'project' ? !!caller.project : caller.project?.type === 'website');

/* ------------------------------------------------------------ JSON-RPC */

const rpcError = (id: any, code: number, message: string, data?: any) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data && { data }) } });
const rpcResult = (id: any, result: any) => ({ jsonrpc: '2.0', id, result });

const handle = async (req: any, msg: any, caller: Caller) => {
	if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
	const { id, method, params } = msg;
	const notification = id === undefined;

	switch (method) {
		case 'initialize': {
			const asked = String(params?.protocolVersion || '');
			return rpcResult(id, {
				protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
				capabilities: { tools: { listChanged: false } },
				serverInfo: SERVER_INFO,
				instructions: caller.project?.type === 'website' ? INSTRUCTIONS + WEBSITE_INSTRUCTIONS : INSTRUCTIONS,
			});
		}
		case 'ping':
			return notification ? null : rpcResult(id, {});
		case 'tools/list':
			return rpcResult(id, {
				tools: TOOLS.filter(t => caller.key.scopes?.includes(t.scope) && available(t, caller)).map(({ name, title, description, inputSchema, annotations }) => ({
					name,
					title,
					description,
					inputSchema,
					annotations: { title, ...annotations },
				})),
			});
		case 'tools/call': {
			const tool = TOOLS.find(t => t.name === params?.name && available(t, caller));
			if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
			const denied = can(caller, tool.scope);
			if (denied) return rpcResult(id, { content: [{ type: 'text', text: denied }], isError: true });
			try {
				await syncDynamicModels({ app: req.app });
				const out = await tool.run(req, params?.arguments || {}, caller);
				console.log(`MCP ${tool.name} by key ${caller.key.prefix}… (${caller.user.email || caller.user._id})${out.isError ? ' — refused' : ''}`);
				return rpcResult(id, {
					content: [{ type: 'text', text: out.text }],
					...(out.data && { structuredContent: out.data }),
					...(out.isError && { isError: true }),
				});
			} catch (e: any) {
				console.error(`MCP ${tool.name}:`, e?.message);
				return rpcResult(id, { content: [{ type: 'text', text: `The tool failed: ${e?.message || 'unknown error'}` }], isError: true });
			}
		}
		default:
			if (notification) return null; // notifications/initialized, cancelled, …
			return rpcError(id, -32601, `Method not found: ${method}`);
	}
};

type Authenticate = (req: Request) => Promise<Caller | { error: string }>;

const makePost = (authenticateWith: Authenticate) => async (req: any, res: Response) => {
	const caller = await authenticateWith(req);
	if ('error' in caller) {
		res.setHeader('WWW-Authenticate', 'Bearer realm="e-mint", error="invalid_token"');
		return res.status(401).json(rpcError(null, -32001, caller.error));
	}
	// The builder resolves models against the admin API's routes, which it reads off the app.
	req.user = caller.user;
	req.permissions = caller.permissions;

	const body = req.body;
	const batch = Array.isArray(body);
	const messages = batch ? body : [body];
	if (!messages.length) return res.status(400).json(rpcError(null, -32600, 'Empty batch'));

	const answer = async () => {
		const replies = [];
		for (const m of messages) {
			const r = await handle(req, m, caller);
			if (r) replies.push(r);
		}
		return replies;
	};
	// A tenant key works inside its project only: every query the tools make is scoped.
	const replies = caller.scope ? await runInScope(caller.scope, answer) : await answer();
	if (!replies.length) return res.status(202).end();
	return res.status(200).json(batch ? replies : replies[0]);
};

const notAllowed = (req: Request, res: Response) => res.status(405).set('Allow', 'POST').json(rpcError(null, -32000, 'Use POST — this server has no event stream'));

/** The MCP endpoint over one way of authenticating: the admins' (/mcp) or tenant projects' (/tenant/mcp). */
export const makeMcpRouter = (authenticateWith: Authenticate) => {
	const post = makePost(authenticateWith);
	const router = express.Router();
	router.post('/', post);
	router.post('/:key', post);
	router.get('/', notAllowed);
	router.get('/:key', notAllowed);
	router.delete('/', notAllowed);
	router.delete('/:key', notAllowed);
	return router;
};

export type { Caller, ToolDef };
export { hashKey };

export default makeMcpRouter(authenticate);
