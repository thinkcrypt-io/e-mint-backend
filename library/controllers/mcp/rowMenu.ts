import { PdfTemplate } from '../../models/pdf-templates/_index.js';
import { LOCK_OPS } from '../../functions/fieldLocks.function.js';

/**
 * update_page's `rowMenu` — the table's ⋯ menu on each row (config
 * `route.menu`), as the route builder's Row menu edits it. The types and the
 * parameters they need are the admin's menuTypes.ts ROW_MENU_TYPES (admin and
 * mint-tenant) — keep them in step. Items of a type the builder doesn't offer
 * (code-defined custom items) can only be kept as they are, never made here.
 */

type Param = { name: string; kind: 'text' | 'field' | 'fields' | 'keyType' | 'json' | 'prompt' | 'route' | 'value' | 'presets' | 'pdfTemplate' | 'richField' | 'docFormat'; required?: boolean };

const prompt: Param = { name: 'prompt', kind: 'prompt' };

export const ROW_MENU_TYPES: Record<string, { hint: string; params?: Param[] }> = {
	'view-server-modal': { hint: 'Quick view — the record in a modal, laid out by the detail page' },
	'view-item': { hint: 'Details page — /view/<route>/<id>' },
	'edit-server-modal': { hint: 'Edit in a modal, laid out by the form' },
	edit: { hint: 'Edit page — /<route>/edit/<id>' },
	view: { hint: 'Record page — /<route>/<id>' },
	duplicate: { hint: 'Copies the record' },
	delete: { hint: 'Deletes the record, after confirming' },
	link: { hint: 'Goes to <href>/<id>', params: [{ name: 'href', kind: 'text', required: true }] },
	redirect: { hint: 'Goes to a fixed address', params: [{ name: 'href', kind: 'text', required: true }] },
	'update-key': {
		hint: 'Quick edit one field in place',
		params: [
			{ name: 'key', kind: 'field', required: true },
			{ name: 'keyType', kind: 'keyType', required: true },
			{ name: 'dataPath', kind: 'text' },
		],
	},
	'set-field': {
		hint: 'Sets one field to a value after confirming — “Mark as void”',
		params: [{ name: 'key', kind: 'field', required: true }, { name: 'value', kind: 'value', required: true }, prompt],
	},
	'download-pdf': { hint: 'Downloads the record printed with one of this page’s PDF templates (empty: the default)', params: [{ name: 'template', kind: 'pdfTemplate' }] },
	'download-docx': {
		hint: 'Download document — one rich-text field of the record (a blog post’s body) as a file; format docx | pdf | md | txt, or leave it out to let the person pick each time',
		params: [{ name: 'field', kind: 'richField', required: true }, { name: 'format', kind: 'docFormat' }],
	},
	'open-editor': {
		hint: 'Opens one rich-text field of the record (a blog post’s body) in a full-page document editor — Save writes only that field; Export gives PDF or Word',
		params: [{ name: 'field', kind: 'richField', required: true }],
	},
	'update-api': { hint: 'PUTs a fixed body to the record', params: [{ name: 'path', kind: 'text' }, { name: 'body', kind: 'json', required: true }, prompt] },
	'add-related': {
		hint: 'Opens another page’s create form, fields filled from this row — “Add payment” on a bill',
		params: [
			{ name: 'route', kind: 'route', required: true },
			{ name: 'presets', kind: 'presets' },
		],
	},
	'view-modal': { hint: 'A modal showing the listed fields', params: [{ name: 'fields', kind: 'fields', required: true }] },
};

const KEY_TYPES = ['string', 'number', 'data-menu'];

/** The guide line for the tool's schema. */
export const ROW_MENU_HELP = Object.entries(ROW_MENU_TYPES)
	.map(([type, t]) => `${type}${t.params?.length ? ` {${t.params.map(p => `${p.name}${p.required ? '' : '?'}`).join(', ')}}` : ''} — ${t.hint}`)
	.join('; ');

const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const empty = (v: any) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

type Ctx = {
	route: string;
	/** A field of this page (records the unknown ones). */
	known: (k: any) => boolean;
	/** Another page of the panel. */
	isRoute: (r: string) => boolean;
	/** A rich-text field (`editor` / `basic-editor`) of this page — download-docx's `field`. */
	rich?: (k: any) => boolean;
	/** The page's row menu as it is — custom items are kept from here. */
	current: any[];
};

/**
 * The row menu, checked: each item `{ type, title, showIf?, showMatch?, …its
 * parameters }`. A download-pdf `template` may be a template's id or its exact
 * name on this page. Returns the items, or the problems.
 */
export const rowMenuOf = async (raw: any, ctx: Ctx): Promise<{ items?: any[]; problems?: string[] }> => {
	if (!Array.isArray(raw)) return { problems: ['rowMenu must be a list of items'] };
	if (raw.length > 30) return { problems: ['rowMenu: 30 items at most'] };
	const templates: any[] = raw.some(i => i?.type === 'download-pdf') ? await PdfTemplate.find({ route: ctx.route }, { name: 1 }).lean() : [];
	const problems: string[] = [];
	const items: any[] = [];

	raw.forEach((item: any, i: number) => {
		const where = `Row menu item ${i + 1}${item?.title ? ` “${item.title}”` : ''}`;
		const bad = (msg: string) => problems.push(`${where}: ${msg}`);
		if (!item || typeof item !== 'object' || Array.isArray(item)) return bad('must be an object');
		const type = ROW_MENU_TYPES[item.type];
		if (!type) {
			// A custom item (from the code config) stays only as it already is.
			const kept = ctx.current.find(c => c?.type === item.type && c?.title === item.title);
			if (kept) items.push(kept);
			else bad(`unknown type “${item.type}” — use ${Object.keys(ROW_MENU_TYPES).join(', ')}`);
			return;
		}
		const title = String(item.title ?? '').trim().slice(0, 60);
		if (!title) return bad('needs a title');
		const out: any = { type: item.type, title };

		for (const p of type.params || []) {
			const v = item[p.name];
			if (empty(v)) {
				if (p.required) bad(`needs ${p.name}`);
				continue;
			}
			switch (p.kind) {
				case 'text':
					out[p.name] = String(v).trim().slice(0, 300);
					break;
				case 'field':
					if (ctx.known(v)) out[p.name] = v;
					else bad(`${p.name} “${v}” is not a field of this page`);
					break;
				case 'fields': {
					const list = (Array.isArray(v) ? v : [v]).filter(ctx.known);
					if (list.length) out[p.name] = [...new Set(list)];
					else bad(`${p.name}: none of them are fields of this page`);
					break;
				}
				case 'keyType':
					if (KEY_TYPES.includes(v)) out[p.name] = v;
					else bad(`keyType must be ${KEY_TYPES.join(', ')}`);
					break;
				case 'json':
					if (typeof v === 'object' && !Array.isArray(v)) out[p.name] = v;
					else bad(`${p.name} must be an object`);
					break;
				case 'value':
					out[p.name] = v;
					break;
				case 'prompt': {
					const pr = typeof v === 'object' ? v : {};
					const next = Object.fromEntries(['title', 'body', 'btnText'].filter(k => String(pr[k] ?? '').trim()).map(k => [k, String(pr[k]).trim().slice(0, 300)]));
					if (Object.keys(next).length) out[p.name] = next;
					break;
				}
				case 'route': {
					const r = String(v).trim().replace(/^\/+|\/+$/g, '');
					if (ctx.isRoute(r)) out[p.name] = r;
					else bad(`no page at /${r}`);
					break;
				}
				case 'presets': {
					const list = Array.isArray(v) ? v : [];
					const ok = list.filter((x: any) => x?.field && (x.from !== undefined || !empty(x.value)));
					if (ok.length < list.length) bad('each filled-in row needs a field, and `from` (this row’s field, or "_id" for the row itself) or a value');
					if (ok.length)
						out[p.name] = ok.map((x: any) => ({
							field: String(x.field),
							...(x.from !== undefined ? { from: String(x.from) } : { value: x.value }),
							...(x.lock && { lock: true }),
						}));
					break;
				}
				case 'richField':
					if (ctx.rich?.(v)) out[p.name] = v;
					else bad(`${p.name} “${v}” is not a rich-text field of this page`);
					break;
				case 'docFormat':
					if (['docx', 'pdf', 'md', 'txt'].includes(String(v).toLowerCase())) out[p.name] = String(v).toLowerCase();
					else bad(`${p.name} must be docx, pdf, md or txt (or left out to ask each time)`);
					break;
				case 'pdfTemplate': {
					const t = templates.find(t => String(t._id) === String(v)) || templates.find(t => t.name === String(v));
					if (t) out[p.name] = String(t._id);
					else bad(`no PDF template “${v}” on /${ctx.route} — list_pdf_templates shows them`);
					break;
				}
			}
		}

		// "Show only when": conditions on the row, like the builder's.
		if (!empty(item.showIf)) {
			const conds: { field: string; op: string; value?: any }[] = (Array.isArray(item.showIf) ? item.showIf : [item.showIf]).map((c: any) => ({
				field: String(c?.field ?? ''),
				op: String(c?.op ?? ''),
				...(c?.value !== undefined && { value: c.value }),
			}));
			const wrong = conds.find(c => !c.field || !(LOCK_OPS as readonly string[]).includes(c.op));
			if (wrong) bad(`a showIf condition needs a field and an op (${LOCK_OPS.join(', ')})`);
			else if (conds.every(c => ctx.known(c.field.split('.')[0]))) {
				out.showIf = conds;
				if (item.showMatch === 'any') out.showMatch = 'any';
			} else bad('showIf names a field this page doesn’t have');
		}
		items.push(out);
	});
	if (problems.length) return { problems };
	// Two identical items are a mistake, not a choice.
	return { items: items.filter((it, i) => items.findIndex(o => same(o, it)) === i) };
};

/** The row menu as get_model shows it. */
export const rowMenuText = (menu: any[]) =>
	(menu || [])
		.map((m: any) => `${m.title || m.type} (${m.type}${m.template ? ` ${m.template}` : ''}${m.showIf?.length ? `, only when ${m.showIf.map((c: any) => `${c.field} ${c.op} ${c.value ?? ''}`.trim()).join(m.showMatch === 'any' ? ' or ' : ' and ')}` : ''})`)
		.join('; ');
