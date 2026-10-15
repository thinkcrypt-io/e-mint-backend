import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import { publishRecord } from '../functions/drafts.function.js';
import { ownRecordsOf } from '../functions/projectIndexes.function.js';
import { KIT_ROUTES, isTyped, kitModel, orderContents, pushPage, typedItem } from './kit.js';
import { connectTree, pageKeyOf, pullTreeContents, saveNew, typesForConnect } from './connect.js';

/**
 * Moving a site's words over to typed Contents (docs/cms D1, §6; CMS-06c).
 * Before content types, the builder kept one Contents record per word —
 * `home-hero-heading-3fa9c1` with `content`, another with `btnText` — and
 * lists of cards in a record's `card`. Here each page's (and the header's and
 * footer's) sections become one typed record each, as the builder makes them
 * now:
 *
 *   1. the panel's latest words are read into the draft tree (each binding's value),
 *   2. a list of cards kept in an old record becomes a typed record of its own (Cards, its rows),
 *   3. the bindings to old records are dropped — the tree keeps their words — and the
 *      tree is connected again (connect.ts): one record per section, bound by path,
 *   4. the new records are published — the old words were live — and the page's draft
 *      saved (a new rev: the site's next Publish puts the new bindings live).
 *
 * The old records stay until then — the live site still reads them — marked
 * `migratedAt`; the site's Publish archives the ones no live page uses any
 * more (`retireMigrated`). Runs inside the project's scope; once per site
 * (`draft.contentsMigratedAt` on the design), lazily when the builder opens,
 * or for every site with scripts/migrateSiteContents.js.
 */

type Report = { pages: { name: string; records: number }[]; records: number; old: number; skipped?: string };

/** Every Contents binding slug and list source in a tree. */
const slugsIn = (tree: any[], out = new Set<string>()) => {
	const visit = (nodes: any[]) => {
		for (const n of nodes || []) {
			if (!n || typeof n !== 'object') continue;
			for (const b of Object.values<any>(n.bind || {})) if (b?.from === 'content' && typeof b.slug === 'string') out.add(b.slug);
			if (n.type === 'collection' && typeof n.props?.source?.content === 'string') out.add(n.props.source.content);
			if (Array.isArray(n.children)) visit(n.children);
			if (n.slots && typeof n.slots === 'object') Object.values<any>(n.slots).forEach(visit);
		}
	};
	visit(Array.isArray(tree) ? tree : []);
	return out;
};

const walk = (nodes: any[], fn: (n: any) => void) =>
	(nodes || []).forEach(n => {
		if (!n || typeof n !== 'object') return;
		fn(n);
		if (Array.isArray(n.children)) walk(n.children, fn);
		if (n.slots && typeof n.slots === 'object') Object.values<any>(n.slots).forEach(l => walk(l, fn));
	});

/** The old (untyped) Contents records, by slug. */
const oldRecords = async (kit: any) => {
	const docs: any[] = await kit.Model.find({ archivedAt: null }, { slug: 1, name: 1, card: 1, block: 1, section: 1 }).lean();
	return new Map(docs.filter(d => d.slug && !typedItem(d)).map(d => [d.slug, d]));
};

/**
 * One tree moved over: its old bindings dropped and connected again; a list
 * of old cards copied into a typed Cards record. Returns the new tree and the
 * records to make — or null when it uses no old record.
 */
const moveTree = async (tree: any[], old: Map<string, any>, o: { pageKey: string; pageName: string; types: any[] }) => {
	if (![...slugsIn(tree)].some(s => old.has(s))) return null;
	const pulled = (await pullTreeContents(tree)).tree;
	const copy = JSON.parse(JSON.stringify(pulled));
	const cards: any[] = [];
	let n = 0;
	walk(copy, x => {
		if (x.bind) {
			for (const k of Object.keys(x.bind)) if (x.bind[k]?.from === 'content' && old.has(x.bind[k].slug)) delete x.bind[k];
			if (!Object.keys(x.bind).length) delete x.bind;
		}
		const src = x.type === 'collection' && x.props?.source?.content;
		if (typeof src === 'string' && old.has(src)) {
			const rec = old.get(src);
			const slug = `${src.replace(/-[a-z0-9]{6}$/, '').slice(0, 100)}-t${++n}${Date.now().toString(36).slice(-4)}`;
			cards.push({
				slug,
				name: rec.name || slug,
				section: rec.section,
				type: 'content.cards',
				block: [{ __component: 'content.cards', items: (rec.card || []).map(({ _id, ...row }: any) => row) }],
			});
			x.props = { ...x.props, source: { ...x.props.source, content: slug } };
		}
	});
	const out = connectTree(copy, { pageKey: o.pageKey, pageName: o.pageName, slugs: 'random', types: o.types });
	return { tree: out.nodes, records: [...out.records, ...cards] };
};

const save = async (kit: any, records: any[], kitPage: any, user: any) => {
	if (!records.length) return;
	await saveNew(kit, records, kitPage, new Set<string>(kit.def.fields.map((f: any) => f.key)));
	// The old words were live: their new records are too.
	if (kit.def.draftAndPublish) {
		const made: any[] = await kit.Model.find({ slug: { $in: records.map(r => r.slug) }, archivedAt: null }, { _id: 1 }).lean();
		for (const m of made) await publishRecord(kit.Model, m._id, user);
	}
};

/**
 * Moves the open project's site over (`apply`), or says what it would do.
 * `force` runs again on a site already moved (a page that still uses an old
 * record).
 */
export const migrateSiteContents = async (req: any, { apply = false, force = false } = {}): Promise<Report> => {
	const report: Report = { pages: [], records: 0, old: 0 };
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit || !isTyped(kit.def)) return { ...report, skipped: 'Contents doesn’t hold typed records yet' };
	const design: any = await SiteDesign.findOne({}).lean();
	if (design?.draft?.contentsMigratedAt && !force) return { ...report, skipped: 'already moved' };
	const types = (await typesForConnect(kit.def)) || [];
	const old = await oldRecords(kit);
	const used = new Set<string>();
	let busy = false;

	for (const page of (await SitePage.find({ deletedAt: null }).lean()) as any[]) {
		const tree = page.draft?.tree || [];
		slugsIn(tree).forEach(s => old.has(s) && used.add(s));
		const moved = await moveTree(tree, old, { pageKey: pageKeyOf(page), pageName: page.name, types });
		if (!moved) continue;
		report.pages.push({ name: page.name, records: moved.records.length });
		report.records += moved.records.length;
		if (!apply) continue;
		const kitPage = page.kitPage || (await pushPage(page));
		// Only over the draft it read: a save meanwhile keeps the page as it is, for the next run.
		const res = await SitePage.updateOne({ _id: page._id, 'draft.rev': page.draft?.rev }, { $set: { 'draft.tree': moved.tree }, $inc: { 'draft.rev': 1 } });
		if (!res.modifiedCount) {
			busy = true;
			continue;
		}
		await save(kit, moved.records, kitPage, req?.user);
		await orderContents(kitPage, moved.tree);
	}

	const layouts = design?.draft?.layouts || {};
	const next: any = {};
	let layoutsMoved = false;
	for (const [key, l] of Object.entries<any>(layouts)) {
		next[key] = { ...(l || {}) };
		for (const part of ['header', 'footer'] as const) {
			const tree = Array.isArray(l?.[part]) ? l[part] : null;
			if (!tree) continue;
			slugsIn(tree).forEach(s => old.has(s) && used.add(s));
			const name = part === 'header' ? 'Header' : 'Footer';
			const moved = await moveTree(tree, old, { pageKey: key === 'default' ? part : `${key}-${part}`, pageName: key === 'default' ? name : `${name} (${key})`, types });
			if (!moved) continue;
			report.pages.push({ name: key === 'default' ? name : `${name} (${key})`, records: moved.records.length });
			report.records += moved.records.length;
			next[key][part] = moved.tree;
			layoutsMoved = true;
			if (apply) await save(kit, moved.records, null, req?.user);
		}
	}
	report.old = used.size;
	if (!apply) return report;

	// A page saved meanwhile is moved the next time — the site isn't marked done yet.
	const $set: any = busy ? {} : { 'draft.contentsMigratedAt': new Date() };
	if (layoutsMoved) $set['draft.layouts'] = next;
	// A site that never opened the builder has no design yet — nothing to mark.
	if (design && Object.keys($set).length) await SiteDesign.updateOne({ _id: design._id }, { $set, ...(layoutsMoved && { $inc: { 'draft.rev': 1 } }) });
	// The old records the site used: kept for the live site until its next Publish.
	if (used.size) await kit.Model.collection.updateMany({ ...ownRecordsOf(kit.Model), slug: { $in: [...used] }, archivedAt: null, block: { $exists: false } }, { $set: { migratedAt: new Date() } });
	return report;
};

/**
 * After the site's Publish: the old records moved over (`migratedAt`) that no
 * live page or layout uses any more are archived — the table's Archived view
 * still has them.
 */
export const retireMigrated = async (liveTrees: any[][]) => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit) return 0;
	const live = new Set<string>();
	liveTrees.forEach(t => slugsIn(t, live));
	const res = await kit.Model.collection.updateMany({ ...ownRecordsOf(kit.Model), migratedAt: { $exists: true }, archivedAt: null, slug: { $nin: [...live] } }, { $set: { archivedAt: new Date() } });
	return res.modifiedCount || 0;
};
