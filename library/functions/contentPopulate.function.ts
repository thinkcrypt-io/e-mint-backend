import { compiledModel, displayFieldOf, expandComponents } from './dynamicModels.function.js';
import { liveFind } from './drafts.function.js';
import { TenancyError } from './tenancy.function.js';

/**
 * `populate` on the content API (docs/cms D10, CMS-09): a link comes back as
 * the linked record instead of its id —
 *
 *   ?populate=author                 a link field
 *   ?populate=hero.page              a link inside a section, component or list of rows
 *   ?populate=content.page           a link inside content blocks (every block type that has it)
 *   ?populate=author.company         a link of the linked record — two links deep at most
 *   ?populate=*                      everything the endpoint offers
 *
 * Each endpoint offers a list of paths (`populate` on ApiEndpoint, set on the
 * panel's endpoint page); none set → every link one step away. A linked record
 * comes out as its own model's public API shows it (its standard Read one
 * endpoint: who may call it, its rules, its fields, published values) — never
 * more. A model without a public API shows only its name, and can't be gone
 * through. A link the caller can't see is null (or left out of a list).
 */

export const MAX_LINKS = 2;
const MAX_PATHS = 30;
const MAX_IDS = 500;
const LINK = new Set(['reference', 'references']);
const ROWS = new Set(['section', 'sectionlist']);

type Field = { key: string; kind: string; ref?: string; label?: string; fields?: Field[]; blockTypes?: { uid: string; fields: Field[] }[] };
type Defs = Map<string, any>;

/** A model's fields with components opened up (sections, lists of rows, block types). */
const fieldsOf = (def: any): Field[] => expandComponents(def).fields as Field[];

const hasPublicApi = (def: any) => !!def?.publicApi?.enabled;

/**
 * Where a path leads, or why it can't be filled. Sections and blocks are gone
 * through freely; each link counts towards MAX_LINKS.
 */
const follow = (fields: Field[], segs: string[], defs: Defs, links = 0): { links: number; targets: string[] } | string => {
	const [seg, ...rest] = segs;
	const f = fields.find(x => x.key === seg);
	if (!f) return `“${seg}” isn’t a field there`;
	if (ROWS.has(f.kind)) return rest.length ? follow(f.fields || [], rest, defs, links) : `“${seg}” holds fields — name the link inside it, like ${seg}.<field>`;
	if (f.kind === 'blocks') {
		if (!rest.length) return `“${seg}” holds blocks — name the link inside them, like ${seg}.<field>`;
		const hits = (f.blockTypes || []).map(b => follow(b.fields || [], rest, defs, links)).filter(r => typeof r !== 'string') as { links: number; targets: string[] }[];
		if (!hits.length) return `No block type in “${seg}” has a link at ${rest.join('.')}`;
		return { links: Math.max(...hits.map(h => h.links)), targets: [...new Set(hits.flatMap(h => h.targets))] };
	}
	if (!LINK.has(f.kind)) return `“${seg}” isn’t a link`;
	const target = f.ref ? defs.get(f.ref) : null;
	if (!target) return `“${seg}” links to a model that’s gone`;
	if (links + 1 > MAX_LINKS) return `At most ${MAX_LINKS} links deep`;
	if (!rest.length) return { links: links + 1, targets: [target.name] };
	if (!hasPublicApi(target)) return `${target.title || target.name} has no public API — only its name comes out, so nothing past “${seg}” can`;
	return follow(fieldsOf(target), rest, defs, links + 1);
};

/** The project's models by name, for links. */
export const defsByName = (defs: any[]): Defs => new Map(defs.map(d => [d.name, d]));

/** Every path a model's endpoint can offer, for the panel: links in it, and (through public ones) theirs. */
export const populateOptions = (def: any, defs: Defs) => {
	const out: { path: string; label: string; target: string; links: number; full: boolean }[] = [];
	const walk = (fields: Field[], prefix: string, label: string, links: number) => {
		for (const f of fields) {
			if (out.length >= 100) return;
			const path = `${prefix}${f.key}`;
			const name = `${label}${f.label || f.key}`;
			if (ROWS.has(f.kind)) walk(f.fields || [], `${path}.`, `${name} › `, links);
			else if (f.kind === 'blocks') {
				const seen = new Set<string>();
				for (const b of f.blockTypes || []) walk((b.fields || []).filter(x => !seen.has(x.key) && seen.add(x.key)), `${path}.`, `${name} › `, links);
			} else if (LINK.has(f.kind)) {
				const target = f.ref ? defs.get(f.ref) : null;
				if (!target) continue;
				out.push({ path, label: name, target: target.title || target.name, links: links + 1, full: hasPublicApi(target) });
				if (links + 1 < MAX_LINKS && hasPublicApi(target)) walk(fieldsOf(target), `${path}.`, `${name} › `, links + 1);
			}
		}
	};
	walk(fieldsOf(def), '', '', 0);
	return out;
};

/** What an endpoint offers when none are set: every link one step away. */
export const defaultPopulate = (def: any, defs: Defs) => populateOptions(def, defs).filter(o => o.links === 1).map(o => o.path);

/** An endpoint's `populate` as the panel sends it, checked (null: the default). */
export const checkPopulate = (def: any, defs: Defs, list: any, bad: (on: string, message: string) => Error): string[] | null => {
	if (list === null || list === undefined) return null;
	if (!Array.isArray(list)) throw bad('populate', 'Pick the links it can fill');
	if (list.length > MAX_PATHS) throw bad('populate', `At most ${MAX_PATHS} links`);
	const fields = fieldsOf(def);
	const out: string[] = [];
	for (const raw of list) {
		const path = String(raw || '').trim();
		if (!/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,5}$/.test(path)) throw bad('populate', `“${path}” isn’t a path — field keys joined by dots, like author or hero.page`);
		const r = follow(fields, path.split('.'), defs);
		if (typeof r === 'string') throw bad('populate', `${path}: ${r}`);
		if (!out.includes(path)) out.push(path);
	}
	return out;
};

/**
 * The paths a call fills: `?populate=` among what the endpoint offers (`*` —
 * all of them). A path the endpoint doesn't offer is a 400 naming the ones it does.
 */
export const askedPopulate = (offered: string[], raw: any): string[] => {
	if (raw === undefined || raw === '') return [];
	const asked = (Array.isArray(raw) ? raw : [raw])
		.flatMap((r: any) => (typeof r === 'string' ? r.split(',') : []))
		.map((s: string) => s.trim())
		.filter(Boolean);
	if (!asked.length && (Array.isArray(raw) || typeof raw !== 'string'))
		throw new TenancyError(400, 'populate: send link paths, like populate=author,hero.page (populate[x]=… isn’t read)');
	if (asked.includes('*')) return offered;
	const missing = asked.find(p => !offered.includes(p));
	if (missing)
		throw new TenancyError(400, offered.length ? `populate: this endpoint doesn’t fill “${missing}” — it fills ${offered.join(', ')}` : `populate: this endpoint doesn’t fill links`);
	return [...new Set(asked)];
};

/* -------------------------------------------------------------- filling */

/** What a caller may see of a model's records: its public read (query + keys), or null → the name only. */
export type Access = (def: any) => Promise<{ query: any; keys: string[] } | null>;

type Slot = { obj: any; key: string; many: boolean; target: string };

const idOf = (v: any) => (v && typeof v === 'object' && v._id !== undefined ? String(v._id) : v != null ? String(v) : null);

/** Where one path's links sit in these records (already-filled links on the way are gone through). */
const slotsOf = (objs: any[], fields: Field[], segs: string[], defs: Defs, out: Slot[]) => {
	const [seg, ...rest] = segs;
	const f = fields.find(x => x.key === seg);
	if (!f) return;
	for (const obj of objs) {
		if (!obj || typeof obj !== 'object') continue;
		const v = obj[seg];
		if (v == null) continue;
		if (f.kind === 'section') slotsOf([v], f.fields || [], rest, defs, out);
		else if (f.kind === 'sectionlist') slotsOf(Array.isArray(v) ? v : [], f.fields || [], rest, defs, out);
		else if (f.kind === 'blocks') {
			for (const item of Array.isArray(v) ? v : []) {
				const type = (f.blockTypes || []).find(b => b.uid === item?.__component);
				if (type) slotsOf([item], type.fields || [], rest, defs, out);
			}
		} else if (LINK.has(f.kind) && f.ref && defs.has(f.ref)) {
			const target = defs.get(f.ref);
			if (!rest.length) out.push({ obj, key: seg, many: f.kind === 'references', target: target.name });
			else {
				// Further in: through the linked records filled by the shorter path.
				const filled = (Array.isArray(v) ? v : [v]).filter(x => x && typeof x === 'object' && x._id !== undefined);
				slotsOf(filled, fieldsOf(target), rest, defs, out);
			}
		}
	}
};

/** The linked records a caller may see, by id. */
const fetchLinked = async (target: any, ids: string[], access: Access, draft: boolean) => {
	const Model = compiledModel(target.name);
	if (!Model || !ids.length) return new Map<string, any>();
	const reach = await access(target);
	const keys = reach?.keys || ['_id', displayFieldOf(target)];
	const query = { ...(reach?.query || { archivedAt: null }), _id: { $in: ids.slice(0, MAX_IDS) } };
	// A linked record's own links stay as they are (ids) unless a longer path fills them.
	const docs: any[] = await liveFind(target, Model, { query, keys, limit: MAX_IDS, draft, stamp: !!reach });
	// `_model` is how a project's shared collection tells models apart — not the caller's business.
	return new Map(docs.map(({ _model, ...d }) => [String(d._id), d]));
};

/**
 * Fills the asked paths in these records (in place). Shorter paths first, so
 * `author.company` goes through the authors `author` filled; a longer path
 * fills its shorter ones too.
 */
export const populateDocs = async (def: any, docs: any[], paths: string[], defs: Defs, access: Access, { draft = false } = {}) => {
	if (!paths.length || !docs.length) return docs;
	const all = new Set<string>();
	for (const p of paths) {
		const segs = p.split('.');
		// Every link on the way: hero.page.parent → hero.page, hero.page.parent.
		for (let i = 1; i <= segs.length; i++) {
			const r = follow(fieldsOf(def), segs.slice(0, i), defs);
			if (typeof r !== 'string') all.add(segs.slice(0, i).join('.'));
		}
	}
	const order = [...all].sort((a, b) => a.split('.').length - b.split('.').length);
	const fields = fieldsOf(def);
	for (const path of order) {
		const slots: Slot[] = [];
		slotsOf(docs, fields, path.split('.'), defs, slots);
		const byTarget = new Map<string, Set<string>>();
		for (const s of slots) {
			const ids = (s.many ? (Array.isArray(s.obj[s.key]) ? s.obj[s.key] : []) : [s.obj[s.key]]).map(idOf).filter(Boolean) as string[];
			const set = byTarget.get(s.target) || new Set<string>();
			ids.forEach(i => set.add(i));
			byTarget.set(s.target, set);
		}
		const found = new Map<string, Map<string, any>>();
		for (const [name, ids] of byTarget) found.set(name, await fetchLinked(defs.get(name), [...ids], access, draft));
		for (const s of slots) {
			const got = found.get(s.target)!;
			if (s.many) s.obj[s.key] = (Array.isArray(s.obj[s.key]) ? s.obj[s.key] : []).map((v: any) => got.get(idOf(v)!)).filter(Boolean);
			else s.obj[s.key] = got.get(idOf(s.obj[s.key])!) ?? null;
		}
	}
	return docs;
};
