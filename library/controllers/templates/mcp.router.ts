import { Request } from 'express';
import { Admin } from '../../../imports.js';
import { createMcpRouter, McpTool, ToolOutput } from '../mcp/transport.js';
import { KIND_GUIDE } from '../builder/ai.controller.js';
import { BuildError } from '../builder/models.controller.js';
import { TEMPLATE_MAX_STEPS } from '../builder/features.service.js';
import { ORG_PERMISSION_KEYS } from '../../functions/tenantPermissions.function.js';
import { previewTemplate } from '../../functions/templateSandbox.function.js';
import {
	BLOCK_CATEGORIES,
	BUILTIN_PLACEHOLDERS,
	PAGE_TEMPLATES,
	PARTS_BY_TYPE,
	Part,
	PUBLIC_ACTIONS,
	QUESTION_KINDS,
	WEBHOOK_EVENTS,
	stepIdentity,
	whatsInside,
} from './blueprint.js';
import { Issue, Validation } from './validate.js';
import { keyFromSecret } from './keys.js';
import { checkTemplate, createTemplate, exportTemplate, findTemplate, importTemplate, listTemplates, publishTemplate, saveDraft } from './templates.service.js';

/**
 * /templates/mcp — Template Studio's MCP server (docs/templates TD9, T-06).
 *
 * Claude (Code, Desktop, claude.ai…) connects with an `emt_` key and writes
 * **template blueprints** with the super admin: models, sidebar, dashboard,
 * roles, public API, website pages and settings, questions, sample data and
 * the setup guide. Nothing here builds in the platform or a tenant's
 * project — the only build is `preview_template`, into the throwaway sandbox.
 *
 * Separate from the builder's /mcp on purpose: a template key can't build,
 * and a builder key can't touch templates. A key acts as the admin who made it
 * and never beyond their role; its scopes narrow it further.
 */

const SERVER_INFO = { name: 'e-mint-templates', title: 'e-mint Template Studio', version: '1.0.0' };
const adminUrl = (path = '') => `${(process.env.ADMIN_FRONTEND_URL || process.env.ADMIN_URL || '').replace(/\/$/, '')}${path}`;

type Scope = 'read' | 'write' | 'preview' | 'publish';
type Caller = { user: any; permissions: string[]; key: any; has: (p: string) => boolean };
type Tool = McpTool<Caller> & { scope: Scope };

const INSTRUCTIONS = `This server writes project TEMPLATES for e-mint's Template Studio — blueprints a tenant later picks when they start a new app, API or website project. Saving a template builds nothing.

How to work with the user:
1. Agree what the template is for and who will use it, before writing anything.
2. Call describe_template_format once. Then list_templates to see what exists — don't duplicate a template; offer to improve it instead.
3. create_template, then write it ONE PART AT A TIME, showing the user each part and asking before moving on: overview → questions (what's asked when the template is used; set them before any part uses {{key}}) → models (upsert_model, one model per call; linked-to models first) → sidebar → dashboard → roles → endpoints (and webhooks for API, pages + site defaults for websites) → sample data → setup guide.
4. Every write answers with that part's problems and fixes. Fix them as you go. Run validate_template at the end.
5. Explain everything: a template is published only when it has a summary, a description, who it's for, a setup guide, and a description on every model. Give fields help text when they aren't obvious. People who use the template will read all of it.
6. preview_template builds it into a throwaway project and returns a link — share it so the user can click around. Previews are deleted after 24 hours.
7. publish_template only when the user says so explicitly, with notes on what changed. Never publish on your own.`;

/* ------------------------------------------------------------- auth */

const authenticate = async (req: Request): Promise<Caller | { error: string }> => {
	const header = String(req.headers.authorization || '');
	const secret = (req.params as any).key || (header.startsWith('Bearer ') ? header.slice(7).trim() : '');
	const found: any = await keyFromSecret(secret);
	if (found.error) return { error: found.error };
	const user: any = await Admin.findById(found.key.createdBy).select('-password').populate('role');
	if (!user || user.isActive === false || user.isDeleted === true) return { error: 'The admin who made this key no longer has access.' };
	const permissions: string[] = user.role?.permissions || [];
	return { user, permissions, key: found.key, has: p => permissions.includes('*') || permissions.includes(p) };
};

/** What each scope needs of the key's owner (TD10). */
const NEEDS: Record<Scope, string[]> = {
	read: ['view-templates', 'edit-templates'],
	write: ['edit-templates', 'create-templates'],
	preview: ['edit-templates'],
	publish: ['edit-template-publishing'],
};

const denied = (tool: Tool, c: Caller) => {
	if (!c.key.scopes?.includes(tool.scope)) return `This key doesn't have the “${tool.scope}” scope — make one that does in Template Studio → Connect Claude.`;
	if (!NEEDS[tool.scope].some(p => c.has(p))) return `${c.user.name || 'The key’s owner'} doesn't have the permission for this (${NEEDS[tool.scope].join(' or ')}).`;
	return null;
};

/* ---------------------------------------------------------- answers */

const refuse = (text: string): ToolOutput => ({ text, isError: true });

const issueLine = (i: Issue) => `- ${i.message} → ${i.fix}`;

/** A saved part, how it checks, and the template's state overall. */
const report = (doc: any, v: Validation, headline: string, part?: Part): ToolOutput => {
	const mine = (list: Issue[]) => (part ? list.filter(i => i.part === part) : list);
	const [errors, explain, warnings] = [mine(v.errors), mine(v.explain), mine(v.warnings)];
	const lines = [
		headline,
		...(errors.length ? [`Problems${part ? ` in ${part}` : ''} (fix before preview/publish):`, ...errors.map(issueLine)] : []),
		...(explain.length ? [`Still to explain (needed to publish):`, ...explain.map(issueLine)] : []),
		...(warnings.length ? [`Worth a look:`, ...warnings.slice(0, 15).map(issueLine)] : []),
		`Template “${doc.name}” (${doc.type}, ${doc.version ? `v${doc.version}${doc.changed ? ' + unpublished changes' : ''}` : 'never published'}): ${v.errors.length} problem(s), ${v.explain.length} to explain, ${v.warnings.length} warning(s)${v.canPublish ? ' — ready to publish' : ''}.`,
		`In Template Studio: ${adminUrl(`/templates/${doc._id}`)}`,
	];
	return {
		text: lines.join('\n'),
		data: { template: { _id: String(doc._id), key: doc.key, type: doc.type, status: doc.status, version: doc.version }, validation: { ok: v.ok, canPublish: v.canPublish, errors, explain, warnings } },
	};
};

const safely = async (fn: () => Promise<ToolOutput>): Promise<ToolOutput> => {
	try {
		return await fn();
	} catch (e: any) {
		if (e instanceof BuildError) return refuse([e.message, ...(e.problems || []).map(p => `- ${p}`)].join('\n'));
		throw e;
	}
};

const load = async (ref: any) => {
	const doc: any = await findTemplate(String(ref || ''));
	if (!doc) throw new BuildError(404, `No template “${ref}” — list_templates shows them (by key or id).`);
	return doc;
};

/** Saves one part of the draft and reports on it. */
const savePart = (req: any, ref: any, part: Part, value: any, what: string) =>
	safely(async () => {
		const doc: any = await saveDraft(req, (await load(ref))._id, { part, value });
		const v = await checkTemplate(req, doc);
		return report(doc, v, `Saved ${what}.`, part);
	});

const templateArg = { type: 'string', description: 'The template’s key (e.g. "finance-management") or id' };
const writeHints = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const readHints = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const partTool = (name: string, title: string, part: Part, description: string, valueSchema: any, what: string): Tool => ({
	name,
	title,
	description,
	scope: 'write',
	inputSchema: { type: 'object', required: ['template', 'value'], properties: { template: templateArg, value: valueSchema } },
	annotations: writeHints,
	run: (req, args) => savePart(req, args.template, part, args.value, what),
});

/* ----------------------------------------------------- the format guide */

const formatGuide = () => `# e-mint project templates

A template is a blueprint. When a tenant starts a project from it, the project gets everything below, built; after that it's theirs to change. Saving a template builds nothing.

## Types and their parts
${Object.entries(PARTS_BY_TYPE)
	.map(([t, parts]) => `- ${t}: ${parts.join(', ')}`)
	.join('\n')}
- app: a business app — tables, forms, detail pages, a dashboard (Finance management, CRM, HR).
- api: a backend for the tenant's own app — models with public endpoints, customer sign-in, webhooks (Booking API).
- website: a site's content — pages with SEO and content blocks, site settings, plus models for longer lists (Blog posts, Products). Every website project already has the kit models WebPage (/pages), PageSeo (/seo), WebContent (/web-contents); link to them, don't recreate them.

## Parts
- overview: { name, summary (one sentence), description (a few short paragraphs: what's inside, how it's used), audience (who should pick it), category, tags[], icon (a lucide.dev icon name), color, cover (image URL), screenshots[] }
- models: one model per upsert_model call, as a feature-plan step: { name (singular PascalCase), title (plural), description (one line under the page title — required), rationale (why it's there), displayField, code?: { enabled, prefix }, access?: { enabled }, fields: [...], table?, filters?, form?, view? }. Only new models (a project starts empty). Up to ${TEMPLATE_MAX_STEPS} models. Link with reference/references (ref = another model's name) on the "many" side; tabs on the linked model are added for you.
  Field: { key (camelCase), label, kind, required?, unique?, searchable?, helper (help text under the input), default?, options?: [{value,label}], ref?, formula?, min?, max?, fields? (sectionlist rows) }
  Kinds:
${Object.entries(KIND_GUIDE)
	.map(([k, v]) => `  - ${k}: ${v}`)
	.join('\n')}
- sidebar: [{ name, icon, description, items: [{ model (name), label? }] }] — sections in order; models not listed go to the project's first section.
- dashboard: [{ type: 'stat'|'chart'|'recent', route (a model's name), title, metric?: 'count'|'sum'|'avg', field?, range?, group?: 'time'|'field', by?, chart?, columns?, limit? }].
- roles: [{ name, description, permissions }] — organization roles, permissions from: ${ORG_PERMISSION_KEYS.join(', ')}. Owner, Admin and Member exist already.
- endpoints: [{ model, actions (${PUBLIC_ACTIONS.join(', ')}), auth: 'none'|'customer', ownerOnly, note (what the site/app uses it for) }].
- webhooks (api): [{ model, events (${WEBHOOK_EVENTS.join(', ')}), url, note }] — url is where it's sent, usually a question's placeholder (add a question of kind "url", e.g. {{orders_webhook_url}}); left empty, the webhook is made switched off for the project to fill in. Deliveries are signed (x-mint-signature, HMAC-SHA256).
- website.pages: [{ path ("/", "/about"), name, status, template (${PAGE_TEMPLATES.join(', ')}), showInMenu, priority, parent (a path), seo: { title, description (both, or neither), image, keywords[] }, contents: [{ slug (unique on the page), name, section, category (${BLOCK_CATEGORIES.join(', ')}), content, subContent, btnText, url, image, list[], card[], gallery[], richContent }] }]
- website.settings: { identity: { siteName, tagline, logo, favicon, footerText, primaryColor, secondaryColor, fontFamily }, contact: {…}, social: {…}, seo: { metaTitle, titleTemplate ("%s · Acme"), metaDescription, ogImage, keywords[] } }
- website.starter: { repoUrl (https), framework, deployUrl, env: [{ key, value }] }
- questions: [{ key (camelCase), label (the question), help, kind (${QUESTION_KINDS.join(', ')}), options? (select), default, required }] — answers replace {{key}} anywhere in the template. Built in, never asked: ${BUILTIN_PLACEHOLDERS.map(k => `{{${k}}}`).join(', ')}.
- sampleData: { ModelName: [records] } — up to 50 per model; links by the linked record's display value (e.g. "account": "Main account"). Dates can be relative to the day the project is built — "now", "now-12d", "now+3w", "now-2m", "now+1y" — use them so date-ranged dashboard widgets ("this month") always have data. Tenants choose whether to include it.
- guide: { steps: [{ title (an action: "Add your first client"), body (how and why), page (a model name, or a panel path like /site-setup) }], faq: [{ q, a }] } — the checklist a new project shows.

## Rules for publishing
Required: overview.summary, overview.description, overview.audience, at least one guide step, a description on every model; and no errors. Warnings (fields without help text, pages without SEO, endpoints without notes) don't block, but fix what you can — the people using the template read it all.

## Example (app)
create_template { "type": "app", "name": "Finance management", "summary": "Accounts, transactions and budgets for a small team.", "category": "Finance" }
upsert_model { "template": "finance-management", "model": { "name": "Account", "title": "Accounts", "description": "Bank accounts, cards and cash you track.", "rationale": "Every transaction belongs to an account.", "displayField": "name", "fields": [ { "key": "name", "label": "Name", "kind": "text", "required": true }, { "key": "currency", "label": "Currency", "kind": "text", "default": "{{currency}}", "helper": "The account’s currency code, e.g. USD" } ] } }
set_questions { "template": "finance-management", "value": [ { "key": "currency", "label": "Which currency do you work in?", "kind": "currency", "default": "USD", "required": true } ] }`;

/* -------------------------------------------------------------- tools */

const TOOLS: Tool[] = [
	{
		name: 'describe_template_format',
		title: 'How templates are written',
		description: 'The template format: types and their parts, every part’s shape, field kinds, the publishing rules and an example. Call it once before writing.',
		scope: 'read',
		inputSchema: { type: 'object', properties: {} },
		annotations: readHints,
		run: async () => ({ text: formatGuide() }),
	},
	{
		name: 'list_templates',
		title: 'List templates',
		description: 'Every template (archived ones only with status "archived"): key, type, status, version, category, summary, uses.',
		scope: 'read',
		inputSchema: {
			type: 'object',
			properties: { type: { type: 'string', enum: ['app', 'api', 'website'] }, status: { type: 'string', enum: ['draft', 'published', 'archived'] }, search: { type: 'string' } },
		},
		annotations: readHints,
		run: async (_req, args) => {
			const docs: any[] = await listTemplates(args || {});
			if (!docs.length) return { text: 'No templates match.', data: { templates: [] } };
			return {
				text: ['| Key | Name | Type | Status | Version | Category | Summary |', '|---|---|---|---|---|---|---|', ...docs.map(d => `| ${d.key} | ${d.name} | ${d.type} | ${d.status} | ${d.version || '—'}${d.changed && d.version ? '+' : ''} | ${d.category || ''} | ${d.summary || ''} |`)].join('\n'),
				data: { templates: docs.map(d => ({ _id: String(d._id), key: d.key, name: d.name, type: d.type, status: d.status, version: d.version, category: d.category, summary: d.summary, usage: d.usage })) },
			};
		},
	},
	{
		name: 'get_template',
		title: 'Read a template',
		description: 'A template’s draft (every part), what’s inside, and how it checks.',
		scope: 'read',
		inputSchema: { type: 'object', required: ['template'], properties: { template: templateArg } },
		annotations: readHints,
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				const v = await checkTemplate(req, doc);
				const out = report(doc, v, `Template “${doc.name}” — parts: ${PARTS_BY_TYPE[doc.type as 'app'].join(', ')}.`);
				return { text: `${out.text}\n\nDraft:\n${JSON.stringify(doc.draft, null, 1)}`, data: { ...out.data, draft: doc.draft, whatsInside: whatsInside(doc.draft) } };
			}),
	},
	{
		name: 'create_template',
		title: 'Create a template',
		description: 'A new draft template: its type (app, api or website), name, one-sentence summary and category. Its key comes from the name.',
		scope: 'write',
		inputSchema: {
			type: 'object',
			required: ['type', 'name'],
			properties: {
				type: { type: 'string', enum: ['app', 'api', 'website'] },
				name: { type: 'string' },
				summary: { type: 'string' },
				category: { type: 'string' },
				key: { type: 'string', description: 'Optional slug, e.g. "finance-management"' },
			},
		},
		annotations: { ...writeHints, idempotentHint: false },
		run: (req, args) =>
			safely(async () => {
				const doc: any = await createTemplate(req, args, 'mcp');
				return report(doc, await checkTemplate(req, doc), `Created the ${doc.type} template “${doc.name}” — key ${doc.key}.`);
			}),
	},
	{
		name: 'update_overview',
		title: 'Update the overview',
		description: 'Name, summary, description, audience, category, tags, icon, color, cover, screenshots — the fields given are changed, the rest kept.',
		scope: 'write',
		inputSchema: {
			type: 'object',
			required: ['template'],
			properties: {
				template: templateArg,
				name: { type: 'string' },
				summary: { type: 'string', description: 'One sentence — the line under the name in the gallery' },
				description: { type: 'string', description: 'A few short paragraphs: what’s inside and how people use it (markdown)' },
				audience: { type: 'string', description: 'Who should pick it' },
				category: { type: 'string' },
				tags: { type: 'array', items: { type: 'string' } },
				icon: { type: 'string', description: 'A lucide.dev icon name' },
				color: { type: 'string' },
				cover: { type: 'string', description: 'Image URL' },
				screenshots: { type: 'array', items: { type: 'string' } },
			},
		},
		annotations: writeHints,
		run: (req, { template, ...fields }) =>
			safely(async () => {
				const doc: any = await load(template);
				return savePart(req, doc._id, 'overview', { ...doc.draft.overview, ...fields }, 'the overview');
			}),
	},
	{
		name: 'upsert_model',
		title: 'Add or change a model',
		description: 'One model of the template, by name: replaced if the template has it, added otherwise. Same shape as a feature-plan step (describe_template_format).',
		scope: 'write',
		inputSchema: {
			type: 'object',
			required: ['template', 'model'],
			properties: { template: templateArg, model: { type: 'object', description: '{ name, title, description, rationale, displayField, fields: [...], code?, access?, table?, filters?, form?, view? }' }, position: { type: 'number', description: 'Where it goes in the list (0 = first); left out, it stays where it is or goes last' } },
		},
		annotations: writeHints,
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				const model = { ...(args.model || {}), action: 'create' };
				const id = stepIdentity(model);
				if (!id.name) return refuse('The model needs a name (singular, e.g. "Invoice") or a title.');
				const steps: any[] = [...(doc.draft.models?.steps || [])];
				const at = steps.findIndex(s => stepIdentity(s).name === id.name);
				if (at >= 0) steps.splice(at, 1);
				const pos = Number.isInteger(args.position) ? Math.max(0, Math.min(args.position, steps.length)) : at >= 0 ? at : steps.length;
				steps.splice(pos, 0, model);
				return savePart(req, doc._id, 'models', { ...doc.draft.models, steps }, `${at >= 0 ? 'the changed' : 'the new'} model ${id.name} (${steps.length} model(s) now)`);
			}),
	},
	{
		name: 'remove_model',
		title: 'Remove a model',
		description: 'Takes a model out of the template (by name). Parts that pointed at it will report it.',
		scope: 'write',
		inputSchema: { type: 'object', required: ['template', 'name'], properties: { template: templateArg, name: { type: 'string' } } },
		annotations: { ...writeHints, destructiveHint: true },
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				const steps: any[] = (doc.draft.models?.steps || []).filter((s: any) => stepIdentity(s).name.toLowerCase() !== String(args.name || '').toLowerCase());
				if (steps.length === (doc.draft.models?.steps || []).length) return refuse(`The template has no model “${args.name}”.`);
				return savePart(req, doc._id, 'models', { ...doc.draft.models, steps }, `the models without ${args.name}`);
			}),
	},
	partTool('set_sidebar', 'Set the sidebar', 'sidebar', 'The sidebar sections in order: [{ name, icon, description, items: [{ model, label? }] }]. Replaces the whole list.', { type: 'array', items: { type: 'object' } }, 'the sidebar'),
	partTool('set_dashboard', 'Set the dashboard', 'dashboard', 'The home dashboard’s widgets: [{ type, route (a model name), title, metric, field, range, group, by, chart, columns, limit }]. Replaces the whole list.', { type: 'array', items: { type: 'object' } }, 'the dashboard'),
	partTool('set_roles', 'Set the roles', 'roles', 'Organization roles the template suggests: [{ name, description, permissions }]. Replaces the whole list.', { type: 'array', items: { type: 'object' } }, 'the roles'),
	partTool('set_endpoints', 'Set the public API', 'endpoints', 'Public endpoints: [{ model, actions, auth, ownerOnly, note }]. Replaces the whole list.', { type: 'array', items: { type: 'object' } }, 'the public API'),
	partTool('set_webhooks', 'Set the webhooks', 'webhooks', 'API templates: [{ model, events, url, note }] — url usually {{a_url_question}}. Replaces the whole list.', { type: 'array', items: { type: 'object' } }, 'the webhooks'),
	partTool('set_questions', 'Set the questions', 'questions', 'What’s asked when the template is used: [{ key, label, help, kind, options, default, required }]. Answers replace {{key}}. Replaces the whole list.', { type: 'array', items: { type: 'object' } }, 'the questions'),
	partTool('set_sample_data', 'Set the sample data', 'sampleData', 'Example records: { ModelName: [records] }, links by the linked record’s display value. Replaces all sample data.', { type: 'object' }, 'the sample data'),
	partTool('set_setup_guide', 'Set the setup guide', 'guide', 'The checklist a new project shows: { steps: [{ title, body, page }], faq: [{ q, a }] }.', { type: 'object' }, 'the setup guide'),
	{
		name: 'upsert_page',
		title: 'Add or change a page (website)',
		description: 'One page of a website template, by path: { path, name, status, template, showInMenu, priority, parent, seo, contents }. Replaced if the path exists, added otherwise.',
		scope: 'write',
		inputSchema: { type: 'object', required: ['template', 'page'], properties: { template: templateArg, page: { type: 'object' } } },
		annotations: writeHints,
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				if (doc.type !== 'website') return refuse(`“${doc.name}” is ${doc.type === 'app' ? 'an app' : 'an api'} template — pages belong to website templates.`);
				const pages: any[] = [...(doc.draft.website?.pages || [])];
				const at = pages.findIndex(p => p.path === args.page?.path);
				if (at >= 0) pages[at] = args.page;
				else pages.push(args.page);
				return savePart(req, doc._id, 'website', { ...doc.draft.website, pages }, `the page ${args.page?.path} (${pages.length} page(s) now)`);
			}),
	},
	{
		name: 'remove_page',
		title: 'Remove a page (website)',
		description: 'Takes a page out of a website template, by path.',
		scope: 'write',
		inputSchema: { type: 'object', required: ['template', 'path'], properties: { template: templateArg, path: { type: 'string' } } },
		annotations: { ...writeHints, destructiveHint: true },
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				const pages: any[] = (doc.draft.website?.pages || []).filter((p: any) => p.path !== args.path);
				if (pages.length === (doc.draft.website?.pages || []).length) return refuse(`No page at ${args.path}.`);
				return savePart(req, doc._id, 'website', { ...doc.draft.website, pages }, `the pages without ${args.path}`);
			}),
	},
	{
		name: 'set_site_defaults',
		title: 'Set the site settings (website)',
		description: 'A website template’s settings: { identity, contact, social, seo } (describe_template_format lists the fields). Replaces them.',
		scope: 'write',
		inputSchema: { type: 'object', required: ['template', 'settings'], properties: { template: templateArg, settings: { type: 'object' } } },
		annotations: writeHints,
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				if (doc.type !== 'website') return refuse('Site settings belong to website templates.');
				return savePart(req, doc._id, 'website', { ...doc.draft.website, settings: args.settings }, 'the site settings');
			}),
	},
	{
		name: 'set_starter_code',
		title: 'Set the starter code (website)',
		description: 'Where the site’s code starts from: { repoUrl (https), framework, deployUrl, env: [{ key, value }] } — {{api}} and {{slug}} are filled in for each project.',
		scope: 'write',
		inputSchema: { type: 'object', required: ['template', 'starter'], properties: { template: templateArg, starter: { type: 'object' } } },
		annotations: writeHints,
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				if (doc.type !== 'website') return refuse('Starter code belongs to website templates.');
				return savePart(req, doc._id, 'website', { ...doc.draft.website, starter: args.starter }, 'the starter code');
			}),
	},
	{
		name: 'validate_template',
		title: 'Check a template',
		description: 'Every problem (blocks preview and publishing), what’s still to explain (blocks publishing) and the warnings — each with how to fix it.',
		scope: 'read',
		inputSchema: { type: 'object', required: ['template'], properties: { template: templateArg } },
		annotations: readHints,
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				return report(doc, await checkTemplate(req, doc), `Checked “${doc.name}”.`);
			}),
	},
	{
		name: 'preview_template',
		title: 'Preview a template',
		description: 'Builds the draft into a throwaway project (deleted after 24 hours) and returns a single-use link (5 minutes) that opens it. Give the link to the user.',
		scope: 'preview',
		inputSchema: {
			type: 'object',
			required: ['template'],
			properties: {
				template: templateArg,
				answers: { type: 'object', description: 'Answers to the template’s questions, by key' },
				sampleData: { type: 'boolean', description: 'Include the sample data (default true)' },
				from: { type: 'string', enum: ['draft', 'published'] },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: (req, args) =>
			safely(async () => {
				const doc: any = await load(args.template);
				const p = await previewTemplate(req, doc, { from: args.from === 'published' ? 'published' : 'draft', answers: args.answers, sampleData: args.sampleData });
				const r = p.result;
				return {
					text: [
						`Built a preview of “${doc.name}”: ${r.models.length} model(s)${r.pages.length ? `, ${r.pages.length} page(s)` : ''}${Object.keys(r.records).length ? `, sample records in ${Object.keys(r.records).length} model(s)` : ''}.`,
						`Open it (works once, for 5 minutes): ${p.url}`,
						`It is deleted ${new Date(p.project.expiresAt).toUTCString()}. A new link: Template Studio → the template → Previews.`,
						...(r.warnings.length ? ['Notes:', ...r.warnings.map(w => `- ${w}`)] : []),
					].join('\n'),
					data: { url: p.url, project: p.project, result: r },
				};
			}),
	},
	{
		name: 'publish_template',
		title: 'Publish a template',
		description: 'Makes the draft the next version — new projects get it; projects already built keep theirs. ONLY when the user explicitly asks; needs confirm: true and notes on what changed.',
		scope: 'publish',
		inputSchema: { type: 'object', required: ['template', 'notes', 'confirm'], properties: { template: templateArg, notes: { type: 'string' }, confirm: { type: 'boolean' } } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		run: (req, args) =>
			safely(async () => {
				if (args.confirm !== true) return refuse('Publishing reaches every tenant — ask the user, then call again with confirm: true.');
				const doc: any = await publishTemplate(req, (await load(args.template))._id, { notes: args.notes });
				return report(doc, await checkTemplate(req, doc), `Published “${doc.name}” as version ${doc.version}.`);
			}),
	},
	{
		name: 'export_template',
		title: 'Export a template',
		description: 'The draft as JSON (format emint-template@1) — to keep in a repository, or import elsewhere.',
		scope: 'read',
		inputSchema: { type: 'object', required: ['template'], properties: { template: templateArg } },
		annotations: readHints,
		run: (_req, args) =>
			safely(async () => {
				const data = await exportTemplate((await load(args.template))._id);
				return { text: JSON.stringify(data, null, 1), data };
			}),
	},
	{
		name: 'import_template',
		title: 'Import a template',
		description: 'A new draft from an exported template (format emint-template@1). The key gets a suffix when it’s taken.',
		scope: 'write',
		inputSchema: { type: 'object', required: ['data'], properties: { data: { type: 'object' } } },
		annotations: { ...writeHints, idempotentHint: false },
		run: (req, args) =>
			safely(async () => {
				const doc: any = await importTemplate(req, args.data, 'mcp');
				return report(doc, await checkTemplate(req, doc), `Imported “${doc.name}” as a new draft — key ${doc.key}.`);
			}),
	},
];

const router = createMcpRouter<Caller>({
	info: SERVER_INFO,
	realm: 'e-mint-templates',
	instructions: () => INSTRUCTIONS,
	tools: () => TOOLS,
	listed: (tool, caller) => !!caller.key.scopes?.includes((tool as Tool).scope),
	denied: (tool, caller) => denied(tool as Tool, caller),
	authenticate,
	prepare: (req, caller) => {
		req.user = caller.user;
		req.permissions = caller.permissions;
	},
	logLine: (tool, caller, out) => `Templates MCP ${tool.name} by key ${caller.key.prefix}… (${caller.user.email || caller.user._id})${out.isError ? ' — refused' : ''}`,
});

export default router;
