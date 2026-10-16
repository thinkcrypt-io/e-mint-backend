import File from '../models/admin-file/model.js';
import { expandComponents } from './dynamicModels.function.js';
import { currentScope, runUnscoped } from './tenantScope.function.js';

/**
 * A picture's details from the media library (docs/cms D12, CMS-13): alt text,
 * caption, focal point and size, by its address. Records keep storing the
 * address — the details are looked up when they go out, so fixing a picture's
 * alt text in the library fixes it everywhere it's used.
 *
 *   - An image field marked "with details" (`details: true`) answers
 *     `{ url, alt, caption, width, height, focal }` on the public API — inside
 *     sections, components and content blocks too (`withImageDetails`).
 *   - The site gets the alt text and focal point of every picture on a page
 *     (`mediaFor`), for images whose block has no alt of its own and for cropping.
 *
 * A project on the organization's shared library finds its pictures there too:
 * the lookup is by organization.
 */

export type Focal = { x: number; y: number } | null;
export type MediaInfo = { url: string; alt: string; caption: string; width: number | null; height: number | null; focal: Focal };

const MAX_URLS = 500;
const IMAGE_KINDS = new Set(['image', 'images']);

/** The library's files with these addresses, by address (this organization's, the project's own or shared). */
export const lookupMedia = async (urls: string[]): Promise<Map<string, MediaInfo>> => {
	const scope = currentScope();
	const wanted = [...new Set(urls.filter(u => typeof u === 'string' && u))].slice(0, MAX_URLS);
	if (!wanted.length) return new Map();
	const files: any[] = await runUnscoped(() =>
		File.find(
			{ url: { $in: wanted }, trashedAt: null, ...(scope?.organization ? { organization: scope.organization } : { organization: null }) },
			{ url: 1, alt: 1, caption: 1, width: 1, height: 1, focal: 1 }
		).lean()
	);
	return new Map(files.map(f => [f.url, { url: f.url, alt: f.alt || '', caption: f.caption || '', width: f.width ?? null, height: f.height ?? null, focal: f.focal?.x != null ? { x: f.focal.x, y: f.focal.y } : null }]));
};

const blank = (url: string): MediaInfo => ({ url, alt: '', caption: '', width: null, height: null, focal: null });

type Field = { key: string; kind: string; details?: boolean; fields?: Field[]; blockTypes?: { uid: string; fields: Field[] }[] };

/** Every image-with-details slot in these records: the object holding it and its key. */
const slotsOf = (objs: any[], fields: Field[], out: { obj: any; key: string; many: boolean }[]) => {
	for (const obj of objs) {
		if (!obj || typeof obj !== 'object') continue;
		for (const f of fields) {
			const v = obj[f.key];
			if (v == null) continue;
			if (IMAGE_KINDS.has(f.kind) && f.details) out.push({ obj, key: f.key, many: f.kind === 'images' });
			else if (f.kind === 'section') slotsOf([v], f.fields || [], out);
			else if (f.kind === 'sectionlist') slotsOf(Array.isArray(v) ? v : [], f.fields || [], out);
			else if (f.kind === 'blocks')
				for (const item of Array.isArray(v) ? v : []) {
					const type = (f.blockTypes || []).find(b => b.uid === item?.__component);
					if (type) slotsOf([item], type.fields || [], out);
				}
		}
	}
};

/** Whether a model has an image field with details anywhere (so a read without one does no lookup). */
export const hasImageDetails = (def: any): boolean => {
	const any = (fields: Field[]): boolean =>
		fields.some(f => (IMAGE_KINDS.has(f.kind) && f.details) || any(f.fields || []) || (f.blockTypes || []).some(b => any(b.fields || [])));
	return any(expandComponents(def).fields as Field[]);
};

/** The records with each image-with-details field as `{ url, alt, caption, width, height, focal }` (in place). */
export const withImageDetails = async (def: any, docs: any[]) => {
	if (!docs.length || !hasImageDetails(def)) return docs;
	const slots: { obj: any; key: string; many: boolean }[] = [];
	slotsOf(docs, expandComponents(def).fields as Field[], slots);
	const urlOf = (v: any) => (typeof v === 'string' ? v : v?.url);
	const urls = slots.flatMap(s => (s.many ? (Array.isArray(s.obj[s.key]) ? s.obj[s.key] : []) : [s.obj[s.key]]).map(urlOf)).filter(Boolean);
	const found = await lookupMedia(urls);
	const info = (v: any) => {
		const url = urlOf(v);
		return url ? found.get(url) || blank(url) : null;
	};
	for (const s of slots) s.obj[s.key] = s.many ? (Array.isArray(s.obj[s.key]) ? s.obj[s.key].map(info).filter(Boolean) : []) : info(s.obj[s.key]);
	return docs;
};

/**
 * The alt text and focal point of every library picture in what a page draws
 * (its trees and the records it binds), for the site renderer — only those
 * that have either. Addresses are found by walking the data.
 */
export const mediaFor = async (data: any): Promise<Record<string, { alt?: string; focal?: { x: number; y: number } }>> => {
	const urls = new Set<string>();
	const walk = (v: any, depth: number) => {
		if (urls.size >= MAX_URLS || depth > 30 || v == null) return;
		if (typeof v === 'string') {
			if (/^https?:\/\/\S+$/.test(v) && v.length < 1000) urls.add(v);
			return;
		}
		if (typeof v !== 'object' || v instanceof Date) return;
		for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
	};
	walk(data, 0);
	const found = await lookupMedia([...urls]);
	const out: Record<string, { alt?: string; focal?: { x: number; y: number } }> = {};
	for (const [url, m] of found) if (m.alt || m.focal) out[url] = { ...(m.alt && { alt: m.alt }), ...(m.focal && { focal: m.focal }) };
	return out;
};

/** The picture addresses in this data that the library has alt text for — the site check counts them as described. */
export const describedIn = async (data: any): Promise<Set<string>> => new Set(Object.entries(await mediaFor(data)).filter(([, m]) => m.alt).map(([u]) => u));
