import { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import SidebarCategory from '../../models/sidebarcategories/model.js';
import {
	ACCESS_FORM_SECTION,
	ACCESS_VIEW_SECTION,
	FIELD_KINDS,
	RESERVED_KEYS,
	humanize,
	linkTargets,
} from '../../functions/dynamicModels.function.js';
import { buildPreview, checkCopies } from './models.controller.js';

/**
 * "Build with AI" for the model wizard: a prompt in, a whole draft out — the
 * model's fields, and the settings, form, table, view and filters of its page.
 *
 * Claude answers by calling one tool, `build_model`, whose input is the
 * definition plus the page layout. That definition goes through the same
 * checks and generator as one made by hand (buildPreview): if the server
 * refuses it, the problems go back to Claude to fix, a couple of times at
 * most. The layout is then laid over the generated copies, and checked the
 * way a route-builder publish is. Nothing is saved: the wizard gets the draft
 * and the user goes through the steps before creating it.
 *
 * Needs ANTHROPIC_API_KEY in the backend .env; ANTHROPIC_MODEL overrides the
 * model.
 */

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const MAX_ATTEMPTS = 3;
const MAX_PROMPT = 4000;
const SELF = '__self__';

const fail = (res: Response, status: number, message: string, problems?: string[]) =>
	res.status(status).json({ message, ...(problems && { problems }) });

const KIND_GUIDE: Record<string, string> = {
	text: 'a short single line — names, titles, phone numbers, SKUs',
	textarea: 'several lines of plain text — notes, addresses',
	editor: 'formatted rich text — descriptions, articles',
	email: 'an email address',
	url: 'a web address',
	color: 'a colour, like #ff8800',
	number: 'a number — prices, quantities, ratings; can have min/max',
	boolean: 'yes/no — a checkbox',
	date: 'a date; default "now" means when the record is created',
	select: 'exactly one of a fixed list (an enum) — status, priority, type. Needs options',
	multiselect: 'any number of a fixed list (an enum). Needs options',
	tags: 'free list of short texts; options optional (then limited to them)',
	image: 'one uploaded image', images: 'a gallery of uploaded images',
	file: 'one uploaded file (PDF, document)', files: 'several uploaded files',
	video: 'an uploaded video',
	reference: 'a link to ONE record of another model (ref = its model name) — e.g. an order’s customer',
	references: 'links to SEVERAL records of another model',
};

const fieldProps = {
	key: { type: 'string', description: 'camelCase, starts with a letter; letters, digits and _ only' },
	label: { type: 'string', description: 'Human label, e.g. "Due date"' },
	kind: { type: 'string', enum: [...FIELD_KINDS] },
	required: { type: 'boolean' },
	unique: { type: 'boolean', description: 'No two records share a value. Not for long text, yes/no or list kinds.' },
	index: { type: 'boolean', description: 'For fields often filtered or sorted on large collections' },
	default: {
		description:
			'Optional default: a string, number or boolean; a list for multiselect/tags/images/files; "now" or YYYY-MM-DD for dates. Must be one of the options when the field has options.',
	},
	options: {
		type: 'array',
		description:
			'Allowed values (enum). Required for select and multiselect; optional for text, number and tags. Values are stable identifiers (e.g. "in_progress"), labels are what people read.',
		items: {
			type: 'object',
			properties: { value: { type: 'string' }, label: { type: 'string' } },
			required: ['value'],
		},
	},
	ref: { type: 'string', description: `For reference/references: a model name from the list given, or "${SELF}" for this model` },
	min: { type: 'number', description: 'Number: minimum. Text: minimum length.' },
	max: { type: 'number', description: 'Number: maximum. Text: maximum length.' },
	showInTable: { type: 'boolean', description: 'Shown as a table column by default' },
	searchable: { type: 'boolean', description: 'Matched by the table search box' },
	helper: { type: 'string', description: 'Short help text under the input' },
};

const TOOL: Anthropic.Tool = {
	name: 'build_model',
	description:
		'Define a new admin data model and its page: the fields, the create/edit form, the table columns, the detail view, and the filters.',
	input_schema: {
		type: 'object',
		required: ['title', 'name', 'fields', 'table', 'form', 'filters', 'summary'],
		properties: {
			title: { type: 'string', description: 'Plural page title, e.g. "Invoices"' },
			name: { type: 'string', description: 'Singular PascalCase model name, e.g. "Invoice"' },
			description: { type: 'string', description: 'One line shown under the page title' },
			displayField: {
				type: 'string',
				description: 'Key of the text/email/url/select field that names a record where it is linked from (usually name or title). Or "code".',
			},
			code: {
				type: 'object',
				description: 'A readable sequential code on every record, like INV-0001 — for documents people refer to by number.',
				properties: {
					enabled: { type: 'boolean' },
					prefix: { type: 'string', description: 'Up to 10 letters/digits, e.g. INV' },
					padding: { type: 'integer', minimum: 1, maximum: 12 },
				},
			},
			access: {
				type: 'object',
				description:
					'Per-record access: every record gets an owner, a privacy (only me / private / public, chosen per record in its form) and a list of people it is shared with. Turn on for personal or confidential records (documents, notes, contracts, HR records); leave off for shared operational data.',
				properties: {
					enabled: { type: 'boolean' },
				},
			},
			fields: {
				type: 'array',
				description: 'The fields, in the order the form and detail page should show them.',
				items: { type: 'object', required: ['key', 'label', 'kind'], properties: fieldProps },
			},
			table: {
				type: 'array',
				items: { type: 'string' },
				description: 'Field keys shown as table columns, in order. "code" and "createdAt" may be used too. 4–7 columns is typical.',
			},
			form: {
				type: 'array',
				description:
					'Form sections. Each row is a key, or a pair of keys shown side by side (short inputs only). Every field must appear exactly once.',
				items: {
					type: 'object',
					required: ['sectionTitle', 'fields'],
					properties: {
						sectionTitle: { type: 'string' },
						description: { type: 'string' },
						fields: {
							type: 'array',
							items: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, maxItems: 2 }] },
						},
					},
				},
			},
			view: {
				type: 'array',
				description: 'Detail page sections: a title, 1–3 columns, and the field keys to show.',
				items: {
					type: 'object',
					required: ['title', 'fields'],
					properties: {
						title: { type: 'string' },
						columns: { type: 'integer', enum: [1, 2, 3] },
						fields: { type: 'array', items: { type: 'string' } },
					},
				},
			},
			filters: {
				type: 'array',
				items: { type: 'string' },
				description:
					'Field keys to filter the table by, most useful first (2–5). Good: select, multiselect, yes/no, date, number (range), reference, tags. Avoid long text and media.',
			},
			sidebarCategory: { type: 'string', description: 'The sidebar category it belongs in — one of the names given' },
			buttonTitle: { type: 'string', description: 'The add button, e.g. "New invoice"' },
			summary: {
				type: 'string',
				description: 'Two to four plain sentences for the user: what you built and any choices worth checking.',
			},
		},
	},
};

const systemPrompt = (targets: any[], categories: any[]) => `You design data models for an admin panel (Express + Mongoose + a generated admin UI).
The user describes what they need to manage; you answer by calling build_model once with a complete, sensible design.

Field kinds:
${Object.entries(KIND_GUIDE)
	.map(([k, v]) => `- ${k}: ${v}`)
	.join('\n')}

Rules:
- Keys are camelCase, unique, and never one of: ${RESERVED_KEYS.join(', ')}. Every model gets _id, createdAt and updatedAt (and "code" when codes are on) automatically — don't add them.
- Never store secrets (passwords, tokens, API keys, OTPs, hashes).
- Use select (with options) whenever a field has a known set of values; give it a sensible default when one value is the natural starting point (e.g. status "draft").
- Link to existing models with reference/references rather than copying their data. Only these models can be linked to:
${targets.length ? targets.map(t => `  - ${t.name}${t.title ? ` (${t.title})` : ''}`).join('\n') : '  (none)'}
  or "${SELF}" for the model itself (e.g. a parent category).
- Mark required only what a record can't exist without. Keep it practical: usually 5–15 fields.
- The display field must be a text, email, url or select field, or "code" when codes are on.
- With access on, "privacy", "access" and "addedBy" are added automatically — don't add them as fields, and don't list them in form/table/view.
- Honour what the user asks for: "only visible to the creator", "shareable", "confidential" mean access on.
- Sidebar categories: ${categories.map(c => c.name).join(', ') || '(none)'}.
- Write labels and the summary in the language of the request.`;

/** Loose AI output -> a body the model checks accept; obvious slips fixed rather than bounced. */
const normalize = (input: any, targets: Set<string>) => {
	const toKey = (v: any) => {
		const words = String(v || '')
			.replace(/[^a-zA-Z0-9]+/g, ' ')
			.trim()
			.split(' ')
			.filter(Boolean);
		const key = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join('');
		return /^[a-zA-Z]/.test(key) ? key : key ? `f${key}` : '';
	};
	const selfName = String(input?.name || '');
	const fields = (Array.isArray(input?.fields) ? input.fields : [])
		.map((f: any) => {
			const kind = (FIELD_KINDS as readonly string[]).includes(f?.kind) ? f.kind : 'text';
			const out: any = {
				key: /^[a-zA-Z][a-zA-Z0-9_]*$/.test(f?.key || '') ? f.key : toKey(f?.key || f?.label),
				label: String(f?.label || '').slice(0, 80),
				kind,
			};
			for (const p of ['required', 'unique', 'index', 'showInTable', 'searchable'])
				if (typeof f?.[p] === 'boolean') out[p] = f[p];
			for (const p of ['min', 'max']) if (typeof f?.[p] === 'number') out[p] = f[p];
			if (f?.helper) out.helper = String(f.helper).slice(0, 200);
			if (Array.isArray(f?.options) && f.options.length) {
				const seen = new Set<string>();
				out.options = f.options
					.map((o: any) => (typeof o === 'object' ? o : { value: o }))
					.map((o: any) => ({ value: String(o?.value ?? '').trim().slice(0, 80), label: String(o?.label ?? '').slice(0, 80) }))
					.filter((o: any) => o.value && !seen.has(o.value) && seen.add(o.value));
			}
			if (f?.default !== undefined && f?.default !== null && f?.default !== '') out.default = f.default;
			if (kind === 'reference' || kind === 'references') {
				const ref = String(f?.ref || '');
				out.ref = !ref || ref === selfName || ref === SELF ? SELF : ref;
				if (out.ref !== SELF && !targets.has(out.ref)) {
					// Named a model that doesn't exist: an honest text field beats a broken link.
					out.kind = kind === 'reference' ? 'text' : 'tags';
					delete out.ref;
				}
			}
			return out;
		})
		.filter((f: any) => f.key && !RESERVED_KEYS.includes(f.key))
		// Access control brings these itself.
		.filter((f: any) => !(input?.access?.enabled && ['privacy', 'access', 'addedBy'].includes(f.key)));

	const code = input?.code?.enabled
		? {
				enabled: true,
				prefix: String(input.code.prefix || '')
					.replace(/[^A-Za-z0-9]/g, '')
					.slice(0, 10)
					.toUpperCase(),
				padding: Math.min(Math.max(Number(input.code.padding) || 4, 1), 12),
				start: 1,
		  }
		: { enabled: false, prefix: '', padding: 4, start: 1 };

	// Privacy is picked per record in the form; new records start Private.
	const access = { enabled: !!input?.access?.enabled, default: 'private' };

	return {
		access,
		title: String(input?.title || '').slice(0, 80),
		name: String(input?.name || ''),
		description: String(input?.description || '').slice(0, 300),
		displayField: fields.some((f: any) => f.key === input?.displayField) || (input?.displayField === 'code' && code.enabled) ? input.displayField : '',
		code,
		fields,
	};
};

/** Filters for the keys asked for, in that order: the generated ones where there are, otherwise the natural chip for the kind. */
const buildFilters = (keys: string[], def: any, generatedFilters: any[]) => {
	const out: any[] = [];
	for (const key of [...new Set(keys)]) {
		const gen = generatedFilters.find(f => f.name === key);
		if (gen) {
			out.push(gen);
			continue;
		}
		const f = def.fields.find((x: any) => x.key === key);
		if (!f && key !== 'createdAt') continue;
		const label = f ? f.label || humanize(f.key) : 'Created';
		const base = { name: key, label, title: `Filter by ${label}`, category: 'default' };
		if (key === 'createdAt') out.push({ ...base, type: 'date' });
		else if (f.kind === 'number') out.push({ ...base, field: key, type: 'range' });
		else if (['text', 'email', 'url'].includes(f.kind)) out.push({ ...base, type: 'text' });
		else if (f.kind === 'tags') out.push({ ...base, field: `${key}_in`, type: 'multi-select', category: 'distinct', key });
	}
	return out;
};

/** The AI's page layout laid over the generated config; anything it got wrong falls back to what's generated. */
const applyLayout = (input: any, def: any, settings: any, config: any) => {
	const keys = new Set<string>((settings?.fields || []).map((f: any) => f.key));
	const own = def.fields.map((f: any) => f.key);
	const out = { ...config, route: { ...(config.route || {}) } };

	const table = (Array.isArray(input?.table) ? input.table : []).filter((k: any) => typeof k === 'string' && keys.has(k));
	if (table.length) out.table = [...new Set(table)];

	if (Array.isArray(input?.form)) {
		const placed = new Set<string>();
		const place = (k: any) => typeof k === 'string' && own.includes(k) && !placed.has(k) && placed.add(k);
		const sections = input.form
			.map((s: any) => ({
				sectionTitle: String(s?.sectionTitle || ''),
				...(s?.description && { description: String(s.description) }),
				fields: (Array.isArray(s?.fields) ? s.fields : [])
					.map((row: any) => {
						if (Array.isArray(row)) {
							const pair = row.filter(place);
							return pair.length > 1 ? pair : pair[0];
						}
						return place(row) ? row : null;
					})
					.filter(Boolean),
			}))
			.filter((s: any) => s.fields.length);
		// A field left out of the form could never be filled in.
		const missing = own.filter((k: string) => !placed.has(k));
		if (sections.length) {
			if (missing.length) sections[sections.length - 1].fields.push(...missing);
			out.form = sections;
		}
	}

	if (Array.isArray(input?.view)) {
		const sections = input.view
			.map((s: any) => ({
				title: String(s?.title || ''),
				columns: [1, 2, 3].includes(s?.columns) ? s.columns : 2,
				fields: [...new Set((Array.isArray(s?.fields) ? s.fields : []).filter((k: any) => typeof k === 'string' && keys.has(k)))],
			}))
			.filter((s: any) => s.fields.length);
		if (sections.length) out.view = sections;
	}

	// Access has its own section and columns, whatever the layout says.
	if (def.access?.enabled) {
		const hasKey = (sections: any[], key: string) => (sections || []).some((s: any) => JSON.stringify(s.fields || []).includes(`"${key}"`));
		if (!hasKey(out.form, 'privacy')) out.form = [...(out.form || []), structuredClone(ACCESS_FORM_SECTION)];
		if (!hasKey(out.view, 'privacy')) out.view = [...(out.view || []), structuredClone(ACCESS_VIEW_SECTION)];
		if (Array.isArray(out.table))
			for (const k of ['privacy', 'addedBy'])
				if (!out.table.includes(k)) {
					const at = out.table.indexOf('createdAt');
					out.table = at === -1 ? [...out.table, k] : [...out.table.slice(0, at), k, ...out.table.slice(at)];
				}
	}

	if (Array.isArray(input?.filters)) out.filters = buildFilters(input.filters, def, config.filters || []);
	// Filtering by privacy and owner comes with access.
	if (def.access?.enabled)
		for (const f of (config.filters || []).filter((f: any) => ['privacy', 'addedBy'].includes(f.name)))
			if (!(out.filters || []).some((x: any) => x.name === f.name)) out.filters = [...(out.filters || []), f];
	if (input?.buttonTitle) out.route.button = { ...(out.route.button || {}), title: String(input.buttonTitle).slice(0, 60) };

	// The table's columns are the ones shown by default; the rest can be picked.
	const shown = new Set(out.table || []);
	const outSettings = {
		...settings,
		fields: (settings?.fields || []).map((f: any) =>
			out.table && f.schema ? { ...f, schema: { ...f.schema, default: shown.has(f.key), displayInTable: shown.has(f.key) } } : f
		),
	};
	return { settings: outSettings, config: out };
};

/**
 * POST /builder/models/ai  { prompt, current? }
 * `current` is the wizard's definition so far — sent to refine it rather than
 * start over.
 */
export const aiBuildModel = async (req: any, res: Response): Promise<Response> => {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey)
		return fail(res, 503, 'Building with AI isn’t set up: add ANTHROPIC_API_KEY to the backend .env and restart the server.');

	const prompt = String(req.body?.prompt || '').trim();
	if (!prompt) return fail(res, 400, 'Describe the model you want');
	if (prompt.length > MAX_PROMPT) return fail(res, 400, `Keep the description under ${MAX_PROMPT} characters`);

	try {
		const [targets, categories] = await Promise.all([
			linkTargets(req.app),
			SidebarCategory.find({}, { name: 1 }).sort({ priority: 1, name: 1 }).lean(),
		]);
		const targetNames = new Set<string>(targets.map((t: any) => t.name));
		const client = new Anthropic({ apiKey });

		const current = req.body?.current;
		const messages: Anthropic.MessageParam[] = [
			{
				role: 'user',
				content: current?.fields?.length
					? `Here is the model so far:\n${JSON.stringify(current, null, 2)}\n\nChange it as follows, keeping what isn't mentioned:\n${prompt}`
					: prompt,
			},
		];

		let lastProblems: string[] = [];
		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const reply = await client.messages.create({
				model: MODEL(),
				max_tokens: 8000,
				system: systemPrompt(targets, categories),
				tools: [TOOL],
				tool_choice: { type: 'tool', name: TOOL.name },
				messages,
			});
			const call = reply.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
			if (!call) return fail(res, 502, 'Claude didn’t return a model — try rewording the request');
			if (reply.stop_reason === 'max_tokens')
				return fail(res, 502, 'The model came out too large — ask for fewer fields, or build it in two passes');

			const input: any = call.input;
			const body = normalize(input, targetNames);
			const preview = await buildPreview(req, body);

			if (preview.problems) {
				lastProblems = preview.problems.length ? preview.problems : [preview.message];
				messages.push(
					{ role: 'assistant', content: reply.content },
					{
						role: 'user',
						content: [
							{
								type: 'tool_result',
								tool_use_id: call.id,
								is_error: true,
								content: `The server refused this model:\n${lastProblems.map(p => `- ${p}`).join('\n')}\nCall build_model again with these fixed.`,
							},
						],
					}
				);
				continue;
			}

			const { def, availability, generated, fields, models } = preview;
			let { settings, config } = applyLayout(input, def, preview.settings, preview.config);
			const warnings: string[] = [];
			// The layout is checked like a publish; one that doesn't pass is dropped for the generated pages.
			const copies = await checkCopies(req.app, def, settings, config);
			if (copies.problems.length) {
				warnings.push('Some of the suggested page layout didn’t fit, so the generated one is used instead.');
				settings = preview.settings;
				config = preview.config;
			}

			const category = String(input?.sidebarCategory || '').toLowerCase();
			const sidebarCategory = (categories as any[]).find(c => c.name.toLowerCase() === category)?._id || null;

			return res.status(200).json({
				definition: { ...body, fields: preview.value.fields, displayField: preview.value.displayField || '' },
				summary: String(input?.summary || ''),
				sidebarCategory,
				warnings,
				preview: { availability, settings, config, generated, fields, models },
				model: MODEL(),
			});
		}
		return fail(res, 422, 'Claude couldn’t produce a valid model — try describing it differently', lastProblems);
	} catch (e: any) {
		console.error('AI model builder:', e?.message);
		if (e instanceof Anthropic.AuthenticationError) return fail(res, 502, 'The Anthropic API key was refused — check ANTHROPIC_API_KEY');
		if (e instanceof Anthropic.RateLimitError) return fail(res, 429, 'The AI is busy (rate limited) — try again in a minute');
		if (e instanceof Anthropic.NotFoundError) return fail(res, 502, `The AI model “${MODEL()}” wasn’t found — check ANTHROPIC_MODEL`);
		if (e instanceof Anthropic.APIError) return fail(res, 502, `The AI request failed: ${e.message}`);
		return fail(res, 500, e?.message || 'Could not build the model');
	}
};
