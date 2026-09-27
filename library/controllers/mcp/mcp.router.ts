import express, { Request, Response } from 'express';
import { Admin } from '../../../imports.js';
import { ApiKey } from '../../models/builder/_index.js';
import SidebarCategory from '../../models/sidebarcategories/model.js';
import { syncDynamicModels } from '../../functions/dynamicModels.function.js';
import { BuildError } from '../builder/models.controller.js';
import { hashKey } from '../builder/features.controller.js';
import { buildFeature, modelCatalog, planFeature, planProblems, FeaturePlan, Step } from '../builder/features.service.js';
import { FEATURE_SCHEMA, catalogText, planFromAi, platformGuide } from '../builder/features.schema.js';
import { effectiveConfig, effectiveSettings, publishConfigPatch, routeModel } from '../builder/builder.controller.js';
import { PROTECTED_ROUTES } from '../builder/validate.js';

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
Use update_page for later changes to a page's columns, form or detail layout. Never build without the user's go-ahead.`;

/* ---------------------------------------------------------------- auth */

type Caller = { user: any; permissions: string[]; key: any };

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
	return { user, permissions: user.role?.permissions || [], key };
};

const can = (c: Caller, scope: 'read' | 'build') => {
	if (!c.key.scopes?.includes(scope)) return `This key doesn't have the “${scope}” scope`;
	const need = scope === 'read' ? ['view-builder', 'edit-builder'] : ['edit-builder'];
	if (!c.permissions.includes('*') && !need.some(p => c.permissions.includes(p)))
		return `${c.user.name || 'The key’s owner'} doesn't have the builder permission (${need.join(' or ')})`;
	return null;
};

/* --------------------------------------------------------------- tools */

type ToolDef = {
	name: string;
	title: string;
	description: string;
	scope: 'read' | 'build';
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
		run: async (req, args) => {
			const name = String(args?.name || '').toLowerCase();
			const catalog = await modelCatalog(req.app);
			const m = catalog.find(c => c.name.toLowerCase() === name || c.title.toLowerCase() === name || c.route === name);
			if (!m) return { text: `No model named “${args?.name}”. Call list_models to see them.`, isError: true };
			const config = await effectiveConfig(req.app, m.route);
			const linkedBy = catalog.flatMap(c => c.fields.filter((f: any) => f.ref === m.name).map((f: any) => `${c.name}.${f.key}`));
			const data = {
				...m,
				page: {
					url: adminUrl(`/${m.route}`),
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
		inputSchema: { type: 'object', required: ['feature'], properties: { feature: FEATURE_SCHEMA } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: async (req, args, caller) => {
			try {
				const r = await buildFeature(req, planFromAi(args?.feature), { source: 'mcp', apiKey: caller.key });
				const lines = [
					`Built “${r.feature.title}”.`,
					...r.created.map(c => `- New: ${c.title} — ${adminUrl(`/${c.route}`)} (model: ${adminUrl(`/model-builder/${c.id}`)})`),
					...r.updated.map(u => `- Changed: ${u.title} — added ${u.added.join(', ') || 'nothing'}${u.changed.length ? `; changed ${u.changed.join(', ')}` : ''}`),
					...r.tabs.map(t => `- Tab “${t.title}” on the ${t.page} page`),
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
			'Changes an existing page: its table columns, create/edit form sections, detail-page sections, or add-button title. Published straight away (a version is kept in the route builder). Field keys must be the model’s.',
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
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: async (req, args) => {
			const route = String(args?.route || '').trim();
			if (!route || !routeModel(req.app, route)) return { text: `No page at /${route}. Call list_models for routes.`, isError: true };
			if (PROTECTED_ROUTES.has(route)) return { text: `/${route} controls access and can't be changed here.`, isError: true };
			const settings = await effectiveSettings(req.app, route);
			const keys = new Set<string>([...(settings?.fields || []).map((f: any) => f.key), 'createdAt']);
			const bad: string[] = [];
			const known = (k: any) => (typeof k === 'string' && keys.has(k) ? true : (bad.push(String(k)), false));
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
						return next;
					},
					'Changed by an AI client over MCP'
				);
			} catch (e: any) {
				return { text: e?.message || 'Could not change the page', isError: true };
			}
			return {
				text: `Updated /${route}: ${adminUrl(`/${route}`)}${bad.length ? `\nSkipped unknown keys: ${[...new Set(bad)].join(', ')}` : ''}`,
			};
		},
	},
];

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
				instructions: INSTRUCTIONS,
			});
		}
		case 'ping':
			return notification ? null : rpcResult(id, {});
		case 'tools/list':
			return rpcResult(id, {
				tools: TOOLS.filter(t => caller.key.scopes?.includes(t.scope)).map(({ name, title, description, inputSchema, annotations }) => ({
					name,
					title,
					description,
					inputSchema,
					annotations: { title, ...annotations },
				})),
			});
		case 'tools/call': {
			const tool = TOOLS.find(t => t.name === params?.name);
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

const post = async (req: any, res: Response) => {
	const caller = await authenticate(req);
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

	const replies = [];
	for (const m of messages) {
		const r = await handle(req, m, caller);
		if (r) replies.push(r);
	}
	if (!replies.length) return res.status(202).end();
	return res.status(200).json(batch ? replies : replies[0]);
};

const notAllowed = (req: Request, res: Response) => res.status(405).set('Allow', 'POST').json(rpcError(null, -32000, 'Use POST — this server has no event stream'));

const router = express.Router();
router.post('/', post);
router.post('/:key', post);
router.get('/', notAllowed);
router.get('/:key', notAllowed);
router.delete('/', notAllowed);
router.delete('/:key', notAllowed);

export default router;
