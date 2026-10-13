import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { MODEL } from '../builder/ai.controller.js';
import { fieldTree, FieldNode, templatePaths } from '../../functions/pdfTemplates/data.js';
import { renderPdf } from '../../functions/pdfTemplates/render.js';
import { PdfTemplateData, aliasOf, normalizeTemplate } from '../../functions/pdfTemplates/schema.js';
import { STARTERS } from '../../functions/pdfTemplates/starters.js';
import { FILTERS } from '../../functions/pdfTemplates/tokens.js';
import { loadSettings } from './pdfTemplates.controller.js';

/**
 * POST /pdf-templates/ai { prompt, route, template? } — Build with AI
 * (docs/pdf-templates D12, PT-08). Claude lays a template out for a page from
 * its fields; with `template`, it changes that one. The answer goes through
 * the same check as a save plus a test render, and comes back for up to
 * three repairs; it is returned unsaved — the panel saves it (new) or puts
 * it in the designer (a change).
 *
 * Needs ANTHROPIC_API_KEY (ANTHROPIC_MODEL overrides the model), like the
 * model wizard's Build with AI.
 */

const MAX_PROMPT = 4000;
const MAX_ATTEMPTS = 3;
const fail = (res: Response, status: number, message: string, extra: any = {}) => res.status(status).json({ message, ...extra });

const TOOL: Anthropic.Tool = {
	name: 'build_template',
	description: 'Return the complete PDF template (every block), and a one-line summary of what you made or changed.',
	input_schema: {
		type: 'object',
		properties: {
			summary: { type: 'string', description: 'One sentence for the person: what the template shows.' },
			template: {
				type: 'object',
				description: 'The template: name, description, kind, page, style, lists, header, body, footer — see the system prompt.',
				properties: {
					name: { type: 'string' },
					description: { type: 'string' },
					kind: { type: 'string', enum: ['invoice', 'bill', 'receipt', 'quote', 'statement', 'other'] },
					page: { type: 'object' },
					style: { type: 'object' },
					lists: { type: 'array', items: { type: 'object' } },
					header: { type: 'array', items: { type: 'object' } },
					body: { type: 'array', items: { type: 'object' } },
					footer: { type: 'array', items: { type: 'object' } },
				},
				required: ['name', 'body'],
			},
		},
		required: ['summary', 'template'],
	},
};

const fieldLines = (nodes: FieldNode[], prefix: string, depth = 0): string[] =>
	nodes.flatMap(n => [
		`${'  '.repeat(depth)}- ${prefix}${n.path} (${n.type}${n.list ? ', list' : ''}) — ${n.label}`,
		...(n.children && depth < 2 ? fieldLines(n.children, n.type === 'list' ? '' : prefix, depth + 1) : []),
	]);

const example = () => {
	const { template } = normalizeTemplate(STARTERS[0]);
	const strip = (blocks: any[]): any[] =>
		blocks.map(({ id, ...b }) => ({
			...b,
			...(b.blocks && { blocks: strip(b.blocks) }),
			...(b.columns && b.type === 'columns' && { columns: b.columns.map((c: any) => ({ ...c, blocks: strip(c.blocks) })) }),
		}));
	return JSON.stringify({ name: template.name, kind: template.kind, page: template.page, style: template.style, header: [], body: strip(template.body), footer: strip(template.footer) });
};

const systemPrompt = (tree: any, alias: string) => `You design PDF templates (invoices, bills, receipts, quotes…) for a business app. A template is JSON blocks drawn by a PDF renderer in points (A4 = 595 × 842 pt). Always answer by calling build_template with the COMPLETE template.

## Data
Values go into any text as tokens: {{${alias}.field | filter:arg}}. Roots:
- ${alias} (also "record"): the record being printed — page “${tree.title}”. Its fields:
${fieldLines(tree.fields, `${alias}.`).join('\n')}
- business: name, logo (image URL), address, phone, email, website, taxId, note (bank details / terms) — set once by the business.
- item and index: inside a table's cells, the row and its number (1, 2, …).
- today, now; page and pages (header/footer only); template.name.
- Declared lists: records of another page that point at this one, declared in "lists" as { name, route, foreignField, sort?, limit? } and then used as a root ({{payments | count}}) or as a table's rows ("payments"). Available:
${(tree.lists || []).map((l: any) => `  - route "${l.route}", foreignField "${l.foreignField}" (${l.title}); its rows' fields: ${(l.fields || []).map((f: FieldNode) => f.path).join(', ')}`).join('\n') || '  (none)'}
Use ONLY these fields. A section list (type list) is a table's rows: rows "${alias}.items", cells {{item.qty}}.
Filters: ${Object.keys(FILTERS).join(', ')} — money for amounts, date for dates, words for amount in words, number:2, default:'—', sum:field / count on lists, minus:${alias}.paid for arithmetic.

## Blocks (every block: type, optional mt / mb (space above / below, pt), showIf [{ field, op: is|not|in|gt|gte|lt|lte|contains|empty|filled, value }] + showMatch all|any)
- text { text, size, weight (400|500|600|700), italic, color "#rrggbb", align left|center|right, upper, spacing (letter spacing pt), lineHeight } — "**bold**" inside text, "\\n" for a new line.
- fields { rows: [{ label, value, bold, big, bar (filled accent band), line (rule above) }], labelWidth 0.1–0.9, align left|right, hideEmpty, gap } — label/value rows: details, totals.
- table { rows: "<list path>", columns: [{ header, value, width (share), align }], size, headerBg, headerColor, zebra, lines none|rows|grid, emptyText, pad }
- columns { columns: [{ width (share), valign top|middle|bottom, blocks: [...] }], gap }
- box { blocks: [...], pad, bg, border (pt), borderColor, radius }
- image { src (URL or token like {{business.logo}}), width, height, align }
- divider { color, thickness, dashed } · spacer { height } · pageBreak
Template: { name, description, kind, page: { size A4|Letter|Legal|A5, orientation portrait|landscape, margin [t,r,b,l] }, style: { font sans|mono|helvetica|times|courier, size (body pt, ~9–10), color, muted, accent, lineHeight }, lists, header (repeats on every page), body, footer (repeats; put "Page {{page}} of {{pages}}" here) }.

## Taste
Clean, professional, printable: plenty of white space, one accent colour, numbers right-aligned, amounts with money, totals in a right-hand column with the final amount emphasised, business details at the top, a footer line. Don't invent data — print only fields that exist (or business details). Hide empty rows with hideEmpty.

Example (an invoice for a page whose alias is "invoice"):
${example()}`;

const ROOTS = new Set(['record', 'item', 'index', 'business', 'today', 'now', 'page', 'pages', 'template']);

/** Problems the person would see as blanks: tokens naming fields the page doesn't have. */
const unknownPaths = (t: PdfTemplateData, tree: any): string[] => {
	const known = new Set<string>();
	const add = (nodes: FieldNode[]) =>
		nodes.forEach(n => {
			known.add(n.path);
			if (n.children) add(n.children);
		});
	add(tree.fields || []);
	(tree.lists || []).forEach((l: any) => add(l.fields || []));
	const lists = new Set((t.lists || []).map(l => l.name));
	const out: string[] = [];
	for (const p of templatePaths(t)) {
		const [root, ...rest] = p.split('.');
		if (root === t.alias || root === 'record') {
			const path = rest.join('.');
			// item paths of a section list are written in full here (alias.items.qty).
			const ok = !path || known.has(path) || [...known].some(k => path === k || path.startsWith(`${k}.`)) || [...known].some(k => k.startsWith('item.') && path.endsWith(`.${k.slice(5)}`));
			if (!ok) out.push(`{{${p}}} — the page has no field “${path}”`);
		} else if (!ROOTS.has(root) && !lists.has(root)) out.push(`{{${p}}} — “${root}” isn't a root (use ${t.alias}, business, item, a declared list…)`);
	}
	return [...new Set(out)].slice(0, 20);
};

export const aiBuildTemplate = async (req: any, res: Response) => {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) return fail(res, 503, 'Building with AI isn’t set up: add ANTHROPIC_API_KEY to the backend .env and restart the server.');
	const prompt = String(req.body?.prompt || '').trim();
	if (!prompt) return fail(res, 400, 'Describe the template you want');
	if (prompt.length > MAX_PROMPT) return fail(res, 400, `Keep the description under ${MAX_PROMPT} characters`);
	const route = String(req.body?.route || '').replace(/^\/+|\/+$/g, '');
	const tree = await fieldTree(req, route);
	if (!tree) return fail(res, 400, 'Pick the page it prints');
	const current = req.body?.template && typeof req.body.template === 'object' ? normalizeTemplate(req.body.template).template : null;
	const alias = current?.alias && current.alias !== 'record' ? current.alias : aliasOf(tree.title);

	try {
		const client = new Anthropic({ apiKey });
		const settings = await loadSettings();
		const messages: Anthropic.MessageParam[] = [
			{
				role: 'user',
				content: current
					? `Here is the template now:\n${JSON.stringify({ ...current, slots: undefined, sample: undefined })}\n\nChange it as follows, keeping everything that isn't mentioned:\n${prompt}`
					: prompt,
			},
		];
		let lastProblems: string[] = [];
		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const reply = await client.messages
				.stream({ model: MODEL(), max_tokens: 32000, system: systemPrompt(tree, alias), tools: [TOOL], tool_choice: { type: 'auto' }, messages })
				.finalMessage();
			if (reply.stop_reason === 'refusal') return fail(res, 422, 'Claude declined this request — try describing the template differently');
			if (reply.stop_reason === 'max_tokens') return fail(res, 502, 'The template came out too large — ask for something simpler');
			const call = reply.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
			if (!call) {
				messages.push({ role: 'assistant', content: reply.content }, { role: 'user', content: 'Please call build_template now with the complete template.' });
				continue;
			}
			const input: any = call.input || {};
			const raw = { ...(current || {}), ...(input.template || {}), route, alias };
			const { template, errors } = normalizeTemplate(raw);
			const problems = [...errors];
			const unknown = unknownPaths(template, tree);
			if (attempt < MAX_ATTEMPTS - 1) problems.push(...unknown);
			if (!problems.length) {
				try {
					await renderPdf({ template, records: [{ roots: { [alias]: {}, record: {}, business: settings.business } }], settings, tz: 'UTC' });
				} catch (e: any) {
					problems.push(`It didn't draw: ${e?.message || e}`);
				}
			}
			if (problems.length) {
				lastProblems = problems;
				messages.push(
					{ role: 'assistant', content: reply.content },
					{
						role: 'user',
						content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `The server refused this template:\n${problems.map(p => `- ${p}`).join('\n')}\nCall build_template again with these fixed.` }],
					}
				);
				continue;
			}
			delete (template as any).slots;
			delete (template as any).sample;
			return res.status(200).json({ template, summary: String(input.summary || ''), warnings: unknown, model: MODEL() });
		}
		return fail(res, 422, 'Claude couldn’t make a valid template — try describing it differently', { problems: lastProblems });
	} catch (e: any) {
		console.error('AI PDF template:', e?.message);
		if (e instanceof Anthropic.AuthenticationError) return fail(res, 502, 'The Anthropic API key was refused — check ANTHROPIC_API_KEY');
		if (e instanceof Anthropic.RateLimitError) return fail(res, 429, 'The AI is busy (rate limited) — try again in a minute');
		if (e instanceof Anthropic.NotFoundError) return fail(res, 502, `The AI model “${MODEL()}” wasn’t found — check ANTHROPIC_MODEL`);
		if (e instanceof Anthropic.APIError) return fail(res, 502, `The AI request failed: ${e.message}`);
		return fail(res, 500, e?.message || 'Could not build the template');
	}
};

