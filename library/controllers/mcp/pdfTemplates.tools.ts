import mongoose from 'mongoose';
import { PdfSettings, PdfTemplate } from '../../models/pdf-templates/_index.js';
import { fieldTree, FieldNode } from '../../functions/pdfTemplates/data.js';
import { applyMapping, guessMapping } from '../../functions/pdfTemplates/mapping.js';
import { aliasOf, normalizeSettings, normalizeTemplate, textKey } from '../../functions/pdfTemplates/schema.js';
import { FILTERS } from '../../functions/pdfTemplates/tokens.js';
import { findTemplate, loadSettings } from '../pdfTemplates/pdfTemplates.controller.js';
import { STARTERS } from '../../functions/pdfTemplates/starters.js';
import { withoutScope } from '../../functions/tenantScope.function.js';
import type { ToolDef } from './mcp.router.js';

/**
 * PDF templates through the builder MCP (backend docs/pdf-templates, PT-09):
 * the user's own AI reads the format and a page's fields, starts from a
 * gallery design or writes a template, and saves it — every save through the
 * same check as the designer's (normalizeTemplate).
 */

const GUIDE = `PDF templates print a page's records as designed documents (invoice, bill, receipt…). A template is JSON:
{ name, description, kind: invoice|bill|receipt|quote|statement|other, route (the page), alias (the record's token root, e.g. "bill"),
  page: { size: A4|Letter|Legal|A5, orientation, margin: [t,r,b,l] pt }, style: { font: sans|mono|helvetica|times|courier, size, color, muted, accent, lineHeight },
  lists: [{ name, route, foreignField, sort, limit }]  — records of another page that point at this one,
  header: [blocks] (every page), body: [blocks], footer: [blocks] (every page; "Page {{page}} of {{pages}}") }
Blocks (all take mt/mb space and showIf [{field, op, value}] + showMatch):
- text { text, size, weight 400–700, italic, color, align, upper, spacing, lineHeight } — **bold**, \\n
- fields { rows: [{ label, value, bold, big, bar, line }], labelWidth 0.1–0.9, align left|right, hideEmpty, gap }
- table { rows: "<alias>.<section list>" or a list name, columns: [{ header, value "{{item.x}}", width share, align }], headerBg, headerColor, zebra, lines none|rows|grid, emptyText, pad, size }
- columns { columns: [{ width share, valign, blocks }], gap } · box { blocks, pad, bg, border, borderColor, radius }
- image { src (URL or {{business.logo}}), width, height, align } · divider { color, thickness, dashed } · spacer { height } · pageBreak
Tokens: {{<alias>.field | filter:arg}}; roots: the alias (or record), item + index in table cells, business (name, logo, address, phone, email, website, taxId, note), texts (the project's saved texts by key — {{texts.terms}}; they may hold fields of their own), today, now, page, pages, list names.
Words that never change ("This invoice is computer generated — no signature is required.") are plain text blocks; words the user reuses across templates (terms and conditions, a return policy) are saved texts — save_pdf_text, then {{texts.<key>}}.
Filters: ${Object.keys(FILTERS).join(', ')}.
Steps: get_pdf_fields for the page → write or start from a gallery design (use_pdf_starter) → save_pdf_template → the user checks it in the designer (link returned).`;

const fieldText = (nodes: FieldNode[], prefix: string, depth = 0): string[] =>
	nodes.flatMap(n => [`${'  '.repeat(depth)}- ${n.path.startsWith('item.') ? n.path : prefix + n.path} (${n.type}) ${n.label}`, ...(n.children && depth < 2 ? fieldText(n.children, prefix, depth + 1) : [])]);

const short = (t: any) => ({ id: String(t._id), name: t.name, route: t.route, kind: t.kind, isDefault: !!t.isDefault, alias: t.alias });

export const PDF_TEMPLATE_TOOLS: ToolDef[] = [
	{
		name: 'describe_pdf_templates',
		title: 'How PDF templates work',
		description: 'The PDF template format (blocks, tokens, filters) and the gallery of starter designs. Read once before making or changing a template.',
		scope: 'read',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async () => {
			const [gallery, settings] = await Promise.all([findGallery(), loadSettings()]);
			const texts = settings.texts.map(t => `- {{texts.${t.key}}} — ${t.label}`).join('\n') || '(none yet)';
			return { text: `${GUIDE}\n\nGallery:\n${gallery.map(g => `- ${g.id} — ${g.name}: ${g.description}`).join('\n')}\n\nSaved texts:\n${texts}`, data: { gallery, texts: settings.texts } };
		},
	},
	{
		name: 'list_pdf_templates',
		title: 'List PDF templates',
		description: 'The PDF templates, by page, with which one is each page’s default (what Download PDF uses).',
		scope: 'read',
		inputSchema: { type: 'object', properties: { route: { type: 'string', description: 'Only this page’s' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (_req, args) => {
			const docs: any[] = await PdfTemplate.find(args?.route ? { route: String(args.route) } : {}).sort({ route: 1, isDefault: -1, name: 1 }).lean();
			return {
				text: docs.length ? docs.map(d => `- ${d._id} ${d.name} → /${d.route || '(no page)'}${d.isDefault ? ' (default)' : ''}`).join('\n') : 'No PDF templates yet.',
				data: { templates: docs.map(short) },
			};
		},
	},
	{
		name: 'get_pdf_template',
		title: 'Read a PDF template',
		description: 'One template’s full JSON (a saved one by id, or a gallery design by its id) — read it before changing it.',
		scope: 'read',
		inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (_req, args) => {
			const t = await findTemplate(String(args?.id || ''), { gallery: true });
			if (!t) return { text: 'No template with that id.', isError: true };
			return { text: JSON.stringify(t), data: t };
		},
	},
	{
		name: 'get_pdf_fields',
		title: 'A page’s fields for PDF templates',
		description: 'What a template for this page can print: its fields (linked records opened two steps), its section lists’ row fields, and the pages whose records point at it (for `lists`).',
		scope: 'read',
		inputSchema: { type: 'object', required: ['route'], properties: { route: { type: 'string' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (req, args) => {
			const tree = await fieldTree(req, String(args?.route || ''));
			if (!tree) return { text: 'No page with that route (see list_models).', isError: true };
			const alias = aliasOf(tree.title);
			return {
				text: `Page “${tree.title}” — record root {{${alias}.…}}\n${fieldText(tree.fields, `${alias}.`).join('\n')}\nLists other pages can give:\n${
					tree.lists.map(l => `- route ${l.route}, foreignField ${l.foreignField} (${l.title}); rows: ${l.fields.map(f => f.path).join(', ')}`).join('\n') || '(none)'
				}`,
				data: { ...tree, alias },
			};
		},
	},
	{
		name: 'use_pdf_starter',
		title: 'Start a PDF template from a gallery design',
		description:
			'Copies a gallery design onto a page, its data matched to the page’s fields — guessed when `mapping` is left out (call it once without, read the result, then fix fields with save_pdf_template). Show the user the plan first.',
		scope: 'build',
		inputSchema: {
			type: 'object',
			required: ['from', 'route'],
			properties: {
				from: { type: 'string', description: 'A gallery id from describe_pdf_templates' },
				route: { type: 'string' },
				name: { type: 'string' },
				mapping: { type: 'object', description: 'slot token → the page’s field path ("invoice.total": "grandTotal"); a list slot → {path} or {route, foreignField}' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: async (req, args, caller) => {
			const from = await findTemplate(String(args?.from || ''), { gallery: true });
			if (!from) return { text: 'No gallery design with that id.', isError: true };
			const route = String(args?.route || '');
			const tree = await fieldTree(req, route);
			if (!tree) return { text: 'No page with that route.', isError: true };
			const mapping = args?.mapping && typeof args.mapping === 'object' ? args.mapping : guessMapping(from, tree);
			const mapped = applyMapping(normalizeTemplate(from).template, mapping, { route, title: tree.title });
			const { template, errors } = normalizeTemplate({ ...mapped, name: args?.name || from.name });
			if (errors.length) return { text: `Not saved:\n- ${errors.join('\n- ')}`, isError: true };
			const first = !(await PdfTemplate.exists({ route }));
			const doc: any = await PdfTemplate.create({ ...template, from: String(from._id), isDefault: first, createdBy: caller.user?._id, updatedBy: caller.user?._id });
			const blank = Object.entries(mapping).filter(([, v]) => !v).map(([k]) => k);
			return {
				text: `Made “${doc.name}” for /${route}${first ? ' (its default)' : ''}: ${caller.link(`/pdf-templates/${doc._id}`)}${blank.length ? `\nNot matched (print blank): ${blank.join(', ')}` : ''}`,
				data: { template: short(doc), mapping },
			};
		},
	},
	{
		name: 'save_pdf_template',
		title: 'Save a PDF template',
		description:
			'Creates a template (no `id`) or replaces one (`id`, from list_pdf_templates — read it first with get_pdf_template to keep what’s there). Checked like the designer’s save: the problems come back if it doesn’t fit. `makeDefault` makes it the page’s Download PDF. Show the user the plan first.',
		scope: 'build',
		inputSchema: {
			type: 'object',
			required: ['template'],
			properties: {
				id: { type: 'string' },
				template: { type: 'object', description: 'The whole template — see describe_pdf_templates' },
				makeDefault: { type: 'boolean' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: async (req, args, caller) => {
			const raw = args?.template && typeof args.template === 'object' ? args.template : null;
			if (!raw) return { text: 'Send the template.', isError: true };
			const before: any = args?.id ? (mongoose.isValidObjectId(args.id) ? await PdfTemplate.findById(args.id).lean() : null) : null;
			if (args?.id && !before) return { text: 'No template with that id.', isError: true };
			const { template, errors } = normalizeTemplate({ ...raw, alias: raw.alias || before?.alias || aliasOf(raw.route || '') });
			if (errors.length) return { text: `Not saved:\n- ${errors.join('\n- ')}`, isError: true };
			if (template.route && !(await fieldTree(req, template.route))) return { text: `There's no page “${template.route}”.`, isError: true };
			let doc: any;
			if (before) doc = await PdfTemplate.findByIdAndUpdate(before._id, { $set: { ...template, updatedBy: caller.user?._id } }, { new: true }).lean();
			else doc = (await PdfTemplate.create({ ...template, isDefault: template.route ? !(await PdfTemplate.exists({ route: template.route })) : false, createdBy: caller.user?._id, updatedBy: caller.user?._id })).toObject();
			if (args?.makeDefault && doc.route) {
				await PdfTemplate.updateMany({ route: doc.route, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
				await PdfTemplate.updateOne({ _id: doc._id }, { $set: { isDefault: true } });
				doc.isDefault = true;
			}
			return { text: `${before ? 'Saved' : 'Made'} “${doc.name}”${doc.isDefault ? ' (the page’s default)' : ''}: ${caller.link(`/pdf-templates/${doc._id}`)}`, data: short(doc) };
		},
	},
	{
		name: 'save_pdf_text',
		title: 'Save a text for PDF templates',
		description:
			'Creates or replaces one of the project’s saved texts — terms and conditions, a return policy, a thank-you note — that every template can print as {{texts.<key>}}. Same key replaces it (every template printing it changes); empty `text` with an existing key removes it. **bold** and new lines work; fields like {{bill.dueDate | date}} are filled per record. Show the user the wording first.',
		scope: 'build',
		inputSchema: {
			type: 'object',
			required: ['label'],
			properties: {
				label: { type: 'string', description: 'What people call it: "Terms & conditions"' },
				key: { type: 'string', description: 'Its token name (from the label when left out): terms_conditions' },
				text: { type: 'string' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: async (_req, args, caller) => {
			const label = String(args?.label || '').trim();
			const key = textKey(String(args?.key || '') || label);
			if (!key) return { text: 'Give it a label.', isError: true };
			const settings = await loadSettings();
			const text = String(args?.text ?? '');
			const others = settings.texts.filter(t => t.key !== key);
			const texts = text.trim() ? [...others, { key, label: label || key, text }] : others;
			if (texts.length > 30) return { text: 'A project keeps at most 30 saved texts.', isError: true };
			const data = normalizeSettings({ ...settings, texts });
			await PdfSettings.findOneAndUpdate({ key: 'default' }, { $set: { data, updatedBy: caller.user?._id } }, { upsert: true, new: true });
			return {
				text: text.trim() ? `Saved — templates print it as {{texts.${key}}}.` : `Removed {{texts.${key}}} — templates printing it now print nothing there.`,
				data: { key, texts: data.texts },
			};
		},
	},
];

/** The gallery, short: the super admin's published designs, else the built-in starters. */
const findGallery = async () => {
	const published: any[] = await withoutScope(() => PdfTemplate.find({ 'gallery.published': true }).sort({ 'gallery.order': 1, name: 1 }).lean());
	return published.length
		? published.map(t => ({ id: String(t._id), name: t.name, description: t.description || '', kind: t.kind }))
		: STARTERS.map(s => ({ id: `starter:${s.key}`, name: s.name, description: s.description, kind: s.kind }));
};
