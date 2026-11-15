import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { compiledModel, displayFieldOf } from './dynamicModels.function.js';

/**
 * Key-value fields (docs/key-values): a product's specifications, laid out in sections whose keys come from
 * groups — records of the project's Key values model (name, description, keys; every new project has it). A field
 * shows some groups always (`groups`), and/or by another field's value: `from` + `rules` (a choice, a picked
 * record → groups), `from` link + `via` (the picked record's own list of groups), or a `from` link to the groups.
 *
 * Stored as [{ group, title, description, items: [{ key, value }] }] — the title and description are a copy, so
 * a website reading the public API needs no second call.
 */

export type KvItem = { key: string; value: string };
export type KvSection = { group?: string; title: string; description?: string; items: KvItem[] };
export type KvGroup = { _id: string; title: string; description: string; keys: string[] };

const str = (v: any, max: number) => (v === undefined || v === null ? '' : String(typeof v === 'object' ? v?.name ?? v?.title ?? '' : v).trim().slice(0, max));

/** Whatever was sent, as tidy sections: text keys and values, blank values and empty sections dropped. */
export const tidyKeyValue = (raw: any): KvSection[] | undefined => {
	if (raw === undefined || raw === null || raw === '') return undefined;
	const list = Array.isArray(raw) ? raw : typeof raw === 'object' ? [raw] : [];
	const out: KvSection[] = [];
	for (const s of list.slice(0, 50)) {
		if (!s || typeof s !== 'object') continue;
		const seen = new Set<string>();
		const items: KvItem[] = (Array.isArray(s.items) ? s.items : [])
			.slice(0, 200)
			.map((i: any) => ({ key: str(i?.key, 120), value: str(i?.value, 2000) }))
			.filter((i: KvItem) => i.key && i.value && !seen.has(i.key.toLowerCase()) && seen.add(i.key.toLowerCase()));
		if (!items.length) continue;
		const group = /^[a-f0-9]{24}$/i.test(String(s.group || '')) ? String(s.group) : undefined;
		const description = str(s.description, 500);
		out.push({ ...(group && { group }), title: str(s.title, 120) || 'Details', ...(description && { description }), items });
	}
	return out;
};

/** A group record's keys: a list field (tags) as it is, or a text one split by lines / commas. */
const keysOf = (v: any): string[] => {
	const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]/) : [];
	const seen = new Set<string>();
	return list.map((k: any) => str(k, 120)).filter((k: string) => k && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()));
};

/** Which fields of a group model hold its keys and description: `keys` / `description` by name, else the first list / long text. */
export const groupFieldsOf = (def: any) => {
	const fields: any[] = def?.fields || [];
	const keys = fields.find(f => f.key === 'keys' && ['tags', 'multiselect', 'textarea', 'text'].includes(f.kind)) || fields.find(f => f.kind === 'tags');
	const description = fields.find(f => f.key === 'description' && ['text', 'textarea', 'editor'].includes(f.kind)) || fields.find(f => f.kind === 'textarea');
	return { title: displayFieldOf(def), keys: keys?.key as string | undefined, description: description?.key as string | undefined };
};

export class KvError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

/** The project's Key values model (docs/key-values): every new project has it at /key-values. */
export const KEY_VALUES_ROUTE = 'key-values';

/** Group records of `groupDef` by id, in the given order, as sections to fill. */
const readGroups = async (groupDef: any, groupIds: string[]): Promise<KvGroup[]> => {
	const Group: any = groupDef && compiledModel(groupDef.name);
	const ids = [...new Set(groupIds.filter(id => /^[a-f0-9]{24}$/i.test(id)))];
	if (!Group || !ids.length) return [];
	const gf = groupFieldsOf(groupDef);
	const select = [gf.title, gf.keys, gf.description].filter(Boolean).join(' ');
	const docs: any[] = await Group.find({ _id: { $in: ids }, archivedAt: null }).select(select).lean();
	const byId = new Map(docs.map(d => [String(d._id), d]));
	return ids
		.filter(id => byId.has(id))
		.map(id => {
			const d = byId.get(id);
			return { _id: id, title: str(d[gf.title], 120) || 'Details', description: gf.description ? str(d[gf.description], 500) : '', keys: gf.keys ? keysOf(d[gf.keys]) : [] };
		});
};

const lcs = (v: any) => String(v ?? '').trim().toLowerCase();

/**
 * The groups a key-value field shows for the value(s) its `from` field holds now, in order:
 * the ones it always shows (`groups`), then — by `from` — the ones its `rules` give that value, or the
 * picked record's own list (`via`), or the picked records themselves (a link to Key values).
 */
export const keyValueGroups = async (route: string, fieldKey: string, values: string[]): Promise<KvGroup[]> => {
	const def: any = await ModelDefinition.findOne({ route, active: { $ne: false } }).lean();
	const f = def?.fields?.find((x: any) => x.key === fieldKey && x.kind === 'keyvalue');
	if (!f) throw new KvError(404, `There's no key-value field “${fieldKey}” on /${route}`);
	const picked = [...new Set(values.map(v => String(v).trim()).filter(Boolean))].slice(0, 20);
	const kvDef: any = (f.groups?.length || f.rules?.length) && (await ModelDefinition.findOne({ route: KEY_VALUES_ROUTE, active: { $ne: false } }).lean());

	const fixed: string[] = (f.groups || []).map(String);
	let byValue: string[] = [];
	let groupDef: any = kvDef;
	let fromLink: string[] = [];

	if (f.from && picked.length) {
		if (f.rules?.length) {
			const want = new Set(picked.map(lcs));
			byValue = f.rules.filter((r: any) => want.has(lcs(r.value))).flatMap((r: any) => (r.groups || []).map(String));
		} else {
			const link = def.fields.find((x: any) => x.key === f.from && (x.kind === 'reference' || x.kind === 'references'));
			if (!link?.ref) throw new KvError(400, `${f.label || f.key}: pick the field that decides its groups`);
			const ids = picked.filter(id => /^[a-f0-9]{24}$/i.test(id));
			const linkedDef: any = await ModelDefinition.findOne({ name: link.ref, active: { $ne: false } }).lean();
			const Linked: any = linkedDef && compiledModel(linkedDef.name);
			if (Linked && ids.length) {
				if (f.via) {
					const via = linkedDef.fields.find((x: any) => x.key === f.via && (x.kind === 'reference' || x.kind === 'references'));
					if (!via?.ref) throw new KvError(400, `${f.label || f.key}: ${linkedDef.title} has no link field “${f.via}”`);
					const docs: any[] = await Linked.find({ _id: { $in: ids } }, { [f.via]: 1 }).lean();
					const byId = new Map(docs.map(p => [String(p._id), p]));
					fromLink = ids.flatMap(id => {
						const v = byId.get(id)?.[f.via];
						return (Array.isArray(v) ? v : v ? [v] : []).map((x: any) => String(x?._id || x));
					});
					groupDef = await ModelDefinition.findOne({ name: via.ref, active: { $ne: false } }).lean();
				} else {
					fromLink = ids;
					groupDef = linkedDef;
				}
			}
		}
	}

	const seen = new Set<string>();
	const once = (list: KvGroup[]) => list.filter(g => !seen.has(g._id) && seen.add(g._id));
	const kvGroups = kvDef ? await readGroups(kvDef, [...fixed, ...byValue]) : [];
	const linked = fromLink.length ? await readGroups(groupDef, fromLink) : [];
	return once([...kvGroups, ...linked]);
};

/** GET /<route>/get/keyvalue/:field?value=<v>[,<v>] — the sections a key-value field shows for that value (ids or choices). */
export const getKeyValueGroups = (route: string) => async (req: any, res: any) => {
	try {
		const refs = String(req.query?.value ?? req.query?.ref ?? '')
			.split(',')
			.map(s => s.trim())
			.filter(Boolean);
		const groups = await keyValueGroups(route, String(req.params.field || ''), refs);
		return res.status(200).json({ groups });
	} catch (e: any) {
		return res.status(e instanceof KvError ? e.status : 500).json({ message: e?.message || 'Couldn’t read the keys' });
	}
};
