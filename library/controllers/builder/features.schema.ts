import { RESERVED_KEYS } from '../../functions/dynamicModels.function.js';
import { currentScope } from '../../functions/tenantScope.function.js';
import { KIND_GUIDE, TOOL, fieldProps, normalize, sectionProps } from './ai.controller.js';
import { MAX_STEPS } from './features.service.js';

/**
 * The shape of a feature plan as an AI writes it — one JSON schema for the
 * admin's own "Plan with AI" (Anthropic tool) and the MCP tools an outside AI
 * calls — plus the guide both get: field kinds, rules, and the models that
 * already exist.
 */

const buildModel: any = TOOL.input_schema;
const fieldItem = { type: 'object', required: ['key', 'label', 'kind'], properties: { ...fieldProps, ...sectionProps } };

const TAB = {
	type: 'object',
	description:
		'A tab on this model’s detail page listing another model’s records that link to it. Tabs are suggested automatically for every link in the plan; list one here only to switch it off (enabled: false), rename it, or add one for an existing link.',
	required: ['from', 'field'],
	properties: {
		from: { type: 'string', description: 'The model whose records are listed' },
		field: { type: 'string', description: 'Its reference field that points at this model' },
		title: { type: 'string' },
		enabled: { type: 'boolean' },
	},
};

export const STEP_SCHEMA = {
	type: 'object',
	required: ['action', 'rationale'],
	properties: {
		action: {
			type: 'string',
			enum: ['create', 'update'],
			description: '"create" a new model, or "update" an existing one (add or change its fields, add tabs)',
		},
		rationale: {
			type: 'string',
			description:
				'Shown to the user above this step: 1–3 plain sentences on why this model or change is needed and how it connects to the others.',
		},
		// create
		name: { type: 'string', description: 'create: singular PascalCase model name, e.g. "LeaveRequest"' },
		title: { type: 'string', description: 'create: plural page title, e.g. "Leave requests"' },
		route: {
			type: 'string',
			description:
				'create: optional admin route (and API path) when the user names one, e.g. "web-contents" — lowercase letters, digits and hyphens. Left out, it comes from the name ("leaverequests").',
		},
		description: { type: 'string', description: 'create: one line shown under the page title' },
		displayField: buildModel.properties.displayField,
		code: buildModel.properties.code,
		access: buildModel.properties.access,
		fields: { ...buildModel.properties.fields, description: 'create: the fields, in form order. Link to other models with reference/references (ref = model name — an existing one, or one created in this plan).' },
		table: buildModel.properties.table,
		form: buildModel.properties.form,
		view: buildModel.properties.view,
		filters: buildModel.properties.filters,
		buttonTitle: buildModel.properties.buttonTitle,
		sidebarCategory: { type: 'string', description: 'create: a sidebar category name, when it differs from the feature’s' },
		// update
		model: { type: 'string', description: 'update: the existing model’s name' },
		addFields: {
			type: 'array',
			description: 'update: new fields for the existing model (only models built in the model builder can get fields)',
			items: fieldItem,
		},
		changeFields: {
			type: 'array',
			description: 'update: existing fields, restated in full with the changes (same key and kind — labels, options, required, help text, default)',
			items: fieldItem,
		},
		tabs: { type: 'array', items: TAB },
	},
};

export const FEATURE_SCHEMA = {
	type: 'object',
	required: ['title', 'summary', 'steps'],
	properties: {
		title: { type: 'string', description: 'The feature, e.g. "Leave management"' },
		description: { type: 'string', description: 'What the user asked for, in a sentence or two' },
		summary: {
			type: 'string',
			description: 'Two to four plain sentences for the user: what the feature adds, how the models connect, and any assumption worth checking.',
		},
		sidebarCategory: {
			type: 'string',
			description: 'Where the new pages go in the sidebar: one of the category names given, or "new" for a category named after the feature',
		},
		steps: { type: 'array', minItems: 1, maxItems: MAX_STEPS, items: STEP_SCHEMA },
	},
};

type CatalogEntry = { name: string; title: string; route: string; built: boolean; protected?: boolean; fields: any[] };

const fieldLine = (f: any) => `${f.key}:${f.kind}${f.ref ? `→${f.ref}` : ''}`;

/** The models that exist, one line each — what the AI links to or changes. */
export const catalogText = (catalog: CatalogEntry[]) =>
	catalog
		.filter(c => !c.protected || c.name === 'Admin')
		.map(
			c =>
				`- ${c.name} — “${c.title}”, /${c.route}, ${c.built ? 'built in the model builder (fields can be added)' : 'defined in code (link to it; its fields are fixed)'}: ${c.fields
					.slice(0, 40)
					.map(fieldLine)
					.join(', ')}`
		)
		.join('\n');

/**
 * In a tenant project, names are the project's alone (internally
 * `T<projectId>_<Name>`, collection `t_<projectId>_<route>`), so the AI should
 * name models plainly and never dodge a clash that can't happen.
 */
const projectNaming = () =>
	currentScope()?.project
		? `- Names belong to this project only. Name models plainly for the business — Client, Invoice, Booking, Customer. The platform and other projects may have models with the same names; they never clash with this project's. A name is taken only if list_models shows it here. Never add prefixes, project names or numbers to avoid a clash — plan_feature reports the name and address each model will really get.\n`
		: '';

/** How to design a feature here — the system prompt's rules, and the MCP `describe_platform` answer. */
export const platformGuide = () => `This admin panel (Express + Mongoose + a generated admin UI) builds data models from definitions: each model gets a database collection, a REST API, a table page with filters, a create/edit form, a detail page and a sidebar entry.

A FEATURE is a set of steps built together:
- create: a new model — its fields, and optionally its page layout (table columns, filters, form and view sections, add button).
- update: an existing model — fields added or changed (only models built in the model builder; code models keep their fields), and tabs.
Links: a reference field on one model pointing at another (an invoice's client). For every link, a tab listing the linking records is added to the linked model's detail page automatically (a client's invoices) — don't add reverse arrays for that.

Field kinds:
${Object.entries(KIND_GUIDE)
	.map(([k, v]) => `- ${k}: ${v}`)
	.join('\n')}

Rules:
- Reuse what exists: link to an existing model instead of creating a copy of it (never create a model whose name is taken). Check the model list first.
${projectNaming()}- Put a link on the "many" side as a single reference (LeaveRequest.employee → Employee), not as a list on the "one" side.
- Keys are camelCase, unique, and never one of: ${RESERVED_KEYS.join(', ')}. _id, createdAt, updatedAt (and "code" when codes are on) are automatic.
- Never store the app’s own sign-in secrets (users’ passwords, OTPs, hashes). A credential the business keeps for a client or a system (a portal login, a Wi-Fi key) uses the password kind — encrypted, hidden, revealed only after re-entering one's own password.
- Use select (with options) for known sets of values, with a sensible default (status "draft").
- Mark required only what a record can't exist without. Usually 5–15 fields per model.
- The display field is a text, email, url or select field, or "code" when codes are on.
- Access on (per-record owner/privacy/sharing) for personal or confidential records; it adds privacy, access and addedBy itself.
- Line items: a sectionlist with row fields and a row formula; a record formula adds them up (subtotal = sum(items.total)).
- Order steps so the models others link to come first. At most ${MAX_STEPS} steps.
- Each step's rationale tells the user, in their language, why it's there.`;

/**
 * A plan as an AI sent it, tidied: fields and names put in the shape the
 * checks expect, obvious slips fixed. Refs are kept as written — the plan
 * check reports one that names no model, rather than quietly dropping it.
 */
export const planFromAi = (input: any) => {
	const keepRefs = { has: () => true } as unknown as Set<string>;
	const steps = (Array.isArray(input?.steps) ? input.steps : []).map((s: any) => {
		const tabs = Array.isArray(s?.tabs) ? s.tabs : undefined;
		if (s?.action === 'update') {
			const fieldsOf = (list: any) => (Array.isArray(list) && list.length ? normalize({ name: s.model, fields: list }, keepRefs).fields : []);
			return {
				action: 'update',
				rationale: s.rationale,
				model: s.model,
				addFields: fieldsOf(s.addFields),
				changeFields: fieldsOf(s.changeFields),
				...(tabs && { tabs }),
			};
		}
		const body = normalize(s, keepRefs);
		return {
			action: 'create',
			rationale: s?.rationale,
			...body,
			...(Array.isArray(s?.table) && { table: s.table }),
			...(Array.isArray(s?.filters) && { filters: s.filters }),
			...(Array.isArray(s?.form) && { form: s.form }),
			...(Array.isArray(s?.view) && { view: s.view }),
			...(s?.route && { route: s.route }),
			...(s?.buttonTitle && { buttonTitle: s.buttonTitle }),
			...(s?.sidebarCategory && { sidebarCategory: s.sidebarCategory }),
			...(tabs && { tabs }),
		};
	});
	return {
		title: input?.title,
		description: input?.description,
		summary: input?.summary,
		sidebarCategory: input?.sidebarCategory,
		steps,
	};
};
