import crypto from 'crypto';
import mongoose from 'mongoose';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import SitePage from '../../models/siteBuilder/sitePage.model.js';
import { compiledModel, displayFieldOf } from '../../functions/dynamicModels.function.js';
import { isDraftModel, publishRecord, statusOf, unpublishRecord } from '../../functions/drafts.function.js';
import { ScheduleError, scheduleOf, setSchedule } from '../../functions/contentSchedule.function.js';
import { afterPublish } from '../../functions/publishEvents.function.js';
import { refPopulates } from '../../functions/publicRecords.function.js';
import { applyFormulasLinked } from '../../functions/formula.function.js';
import { recalculateDependents } from '../../functions/formulaDependents.function.js';
import { MODEL_KEY } from '../../functions/projectIndexes.function.js';
import recordHistory from '../../functions/recordHistory.function.js';
import { KIT_ROUTES, kitModel, pullSeo, pushPage } from '../../siteBuilder/kit.js';
import { slugPart } from '../../siteBuilder/connect.js';
import { contentTypes, ensureTypedContents } from '../../siteBuilder/contentTypes.js';
import { wordsIn } from '../../functions/seoPage.function.js';
import { PROTECTED_ROUTES } from '../builder/validate.js';
import { formulasFor, mayWrite, ownedBy, pickFields, saveAll, saveFailure, validationProblems } from './website.tools.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * Content tools for the user's own AI (docs/cms D-AI, CMS-14) — never an AI
 * call from the server. The AI reads what's there, writes **drafts**, and
 * publishes only when the user has said so:
 *
 *   list_content_types   models with drafts and single types (what isn't live yet), a website's page contents
 *   get_entry            one record: its draft, what's published, its status
 *   save_entry_draft     a record's draft, made or changed — never published
 *   publish_entry        publish / take off records, now or at a time (CMS-11) — the key's publish scope and the person's Publish right
 *   get_page_contents    a website page's contents, in order, with their types' fields
 *   fill_page            a page's contents written from a brief, as drafts
 *   suggest_seo          a page's words and current SEO, to write its title and description (saved with save_site_page)
 *
 * translate_entry comes with languages (CMS-12).
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string): Out => ({ text, isError: true });

const MAX_PUBLISH = 100;
const MAX_SECTIONS = 50;
const HIDDEN = new Set(['_published', '_publishedFrom', '__v', MODEL_KEY]);

/** A record as the AI reads it: no snapshot or internals. */
const clean = (doc: any) => {
	if (!doc) return doc;
	const out: any = {};
	for (const [k, v] of Object.entries(doc)) if (!HIDDEN.has(k)) out[k] = v;
	return out;
};

const STATUS_WORDS: Record<string, string> = { draft: 'Draft — never published', published: 'Published', modified: 'Changes not published' };

const fieldLine = (f: any): string =>
	`${f.key} (${f.kind}${f.ref ? ` → ${f.ref}` : ''}${f.component ? ` ${f.component}${f.repeatable ? '[]' : ''}` : ''}${f.options?.length ? `: ${f.options.map((o: any) => o.value).join('|')}` : ''}${f.required ? ', required' : ''})`;

/** A model built here, by route — or why not. */
const contentModel = async (route: string) => {
	const def: any = route ? await ModelDefinition.findOne({ route, active: { $ne: false } }).lean() : null;
	const Model = def ? compiledModel(def.name) : null;
	if (!def || !Model) return { error: `No model at /${route} — list_content_types lists them.` };
	if (PROTECTED_ROUTES.has(route)) return { error: `/${route} controls access — its records can't be changed here.` };
	return { def, Model: Model as mongoose.Model<any> };
};

/** The record a call means: by id, by one field's value (`match`), or a single type's one record. */
const findEntry = async (def: any, Model: mongoose.Model<any>, args: any, extra = '') => {
	if (args?.id) {
		if (!/^[a-f0-9]{24}$/i.test(String(args.id))) return { error: `“${args.id}” isn’t a record id` };
		return { doc: await Model.findOne({ _id: args.id, archivedAt: null }).select(extra) };
	}
	if (args?.match && typeof args.match === 'object') {
		const [key, value] = Object.entries<any>(args.match)[0] || [];
		if (!key || !def.fields.some((f: any) => f.key === key)) return { error: `match names a field of /${def.route}: ${def.fields.map((f: any) => f.key).join(', ')}` };
		return { doc: await Model.findOne({ [key]: value, archivedAt: null }).select(extra) };
	}
	if (def.kind === 'single') return { doc: await Model.findOne({ archivedAt: null }).select(extra) };
	return { doc: null };
};

/* ------------------------------------------------------- list_content_types */

const listContentTypes = async (req: any, _args: any, caller: Caller): Promise<Out> => {
	const defs: any[] = await ModelDefinition.find({ active: { $ne: false } }).sort({ title: 1 }).lean();
	// A website's own kit (Pages, SEO, Contents, Site design) has page tools of its own below.
	const kit = new Set<string>(['website', 'ecommerce'].includes(caller.project?.type as string) ? Object.values(KIT_ROUTES) : []);
	const content = defs.filter(d => (d.draftAndPublish || d.kind === 'single') && !kit.has(d.route));
	const lines: string[] = [];
	const data: any = { models: [], pages: [] };
	for (const d of content) {
		const Model = compiledModel(d.name);
		if (!Model || !caller.allows(`view-${d.route}`)) continue;
		const changed = { $gt: ['$updatedAt', '$_publishedFrom'] };
		const [total, draft, modified] = d.draftAndPublish
			? await Promise.all([
					Model.countDocuments({ archivedAt: null }),
					Model.countDocuments({ archivedAt: null, _publishedAt: null }),
					Model.countDocuments({ archivedAt: null, _publishedAt: { $ne: null }, $expr: changed }),
			  ])
			: [await Model.countDocuments({ archivedAt: null }), 0, 0];
		const canPublish = d.draftAndPublish && caller.allows(`publish-${d.route}`);
		data.models.push({ route: d.route, title: d.title, kind: d.kind || 'collection', drafts: !!d.draftAndPublish, total, draft, modified, canPublish, fields: d.fields.map((f: any) => f.key) });
		lines.push(
			`- ${d.title} /${d.route} — ${d.kind === 'single' ? 'single (one record)' : `${total} record(s)`}${d.draftAndPublish ? `, drafts: ${draft} never published, ${modified} with changes not published${canPublish ? '' : ' (the key’s owner can’t publish here)'}` : ', no drafts (saves go live)'}\n  fields: ${d.fields.map(fieldLine).join(', ')}`
		);
	}
	if (['website', 'ecommerce'].includes(caller.project?.type as string)) {
		const contents = await kitModel(KIT_ROUTES.contents);
		if (contents) {
			// The site builder's pages; their contents hang on each one's Pages record (made when first needed).
			const rows: any[] = await SitePage.find({ deletedAt: null }, { name: 1, path: 1, kitPage: 1 }).sort({ isHome: -1, path: 1 }).lean();
			for (const p of rows)
				data.pages.push({ name: p.name, path: p.path, contents: p.kitPage ? await contents.Model.countDocuments({ page: p.kitPage, archivedAt: null, block: { $exists: true, $ne: [] } }) : 0 });
			const types = (await contentTypes()).filter((t: any) => t.name !== 'list');
			lines.push(
				`\nWebsite pages (get_page_contents, fill_page): ${data.pages.map((p: any) => `${p.path} (${p.contents})`).join(', ') || '—'}`,
				`Page content types: ${types.map((t: any) => `${t.name} — ${(t.fields || []).map((f: any) => f.key).join(', ')}`).join('; ')}`
			);
		}
	}
	if (!lines.length) return { text: 'No content models yet: a model with Drafts and publishing on, or a single type, shows here (build one with plan_feature / build_feature).', data };
	return {
		text: [`Content in ${caller.project?.name || 'this project'}:`, ...lines, '\nDrafts first: save_entry_draft and fill_page never publish. publish_entry only when the user asks for it.'].join('\n'),
		data,
	};
};

/* ---------------------------------------------------------------- get_entry */

const scheduleLines = (s: any) => [
	...(s?.publishAt ? [`Scheduled to publish at ${new Date(s.publishAt).toISOString()} (UTC)${s.publishBy ? `, by ${s.publishBy}` : ''}`] : []),
	...(s?.unpublishAt ? [`Scheduled to come off at ${new Date(s.unpublishAt).toISOString()} (UTC)${s.unpublishBy ? `, by ${s.unpublishBy}` : ''}`] : []),
];

const getEntry = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const m = await contentModel(String(args?.route || '').trim());
	if (m.error) return refuse(m.error);
	const { def, Model } = m as { def: any; Model: mongoose.Model<any> };
	if (!caller.allows(`view-${def.route}`)) return refuse(`${caller.user.name || 'The key’s owner'} can’t see /${def.route}.`);
	if (!args?.id && !args?.match && def.kind !== 'single') return refuse('Say which record: id, or match {field: value} (e.g. {"slug": "spring-menu"}).');
	const found = await findEntry(def, Model, args, '+_published');
	if (found.error) return refuse(found.error);
	if (!found.doc) return refuse(def.kind === 'single' ? `${def.title} has nothing saved yet — save_entry_draft makes it.` : `No such record in /${def.route}.`);
	const populate = await refPopulates(def);
	const doc: any = await Model.populate(found.doc, populate);
	const raw = doc.toObject();
	const status = isDraftModel(def) ? statusOf(raw) : null;
	const published = isDraftModel(def) ? raw._published?.data || null : null;
	const changedKeys = published ? def.fields.map((f: any) => f.key).filter((k: string) => JSON.stringify(raw[k] ?? null) !== JSON.stringify(published[k] ?? null)) : [];
	const draft = clean(raw);
	const schedule = isDraftModel(def) ? await scheduleOf(raw._id) : null;
	return {
		text: [
			`/${def.route} ${raw[displayFieldOf(def)] ? `“${raw[displayFieldOf(def)]}” ` : ''}[${raw._id}] — ${status ? STATUS_WORDS[status] : 'no drafts on this model: what’s here is live'}`,
			`Draft: ${JSON.stringify(draft)}`,
			...(status === 'modified' ? [`Published (what the site and API show): ${JSON.stringify(clean(published))}`, `Changed since: ${changedKeys.join(', ') || '—'}`] : []),
			...scheduleLines(schedule),
			`In the panel: ${caller.page(`${def.route}/${raw._id}`)}`,
		].join('\n'),
		data: { route: def.route, _id: String(raw._id), status, draft, published: published && clean(published), changed: changedKeys, schedule },
	};
};

/* --------------------------------------------------------- save_entry_draft */

const saveEntryDraft = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const m = await contentModel(String(args?.route || '').trim());
	if (m.error) return refuse(m.error);
	const { def, Model } = m as { def: any; Model: mongoose.Model<any> };
	const denied = mayWrite(req, caller, def.route);
	if (denied) return refuse(denied);
	if (!args?.data || typeof args.data !== 'object' || Array.isArray(args.data)) return refuse('Send data: field key → value (only what changes, for a record that exists).');
	const found = await findEntry(def, Model, args);
	if (found.error) return refuse(found.error);
	if (!found.doc && (args?.id || args?.match)) return refuse(`No such record in /${def.route} — leave out id and match to make a new one.`);
	const picked = await pickFields(def, args.data);
	if (picked.problems.length) return refuse(`Nothing saved:\n- ${picked.problems.join('\n- ')}`);
	const isNew = !found.doc;
	const doc: any = found.doc || new Model({ ...ownedBy(Model, caller), ...(def.access?.enabled && { privacy: 'public' }) });
	const before = isNew ? null : doc.toObject();
	doc.set(picked.body);
	const formulas = await formulasFor(req, def);
	await applyFormulasLinked(doc, formulas, Model);
	const problems = validationProblems(doc);
	if (problems.length) return refuse(`Nothing saved:\n- ${problems.join('\n- ')}`);
	if (!isNew && !doc.isModified()) return { text: `Nothing changed — /${def.route} [${doc._id}] already has those values.`, data: { route: def.route, _id: String(doc._id), changed: false } };
	try {
		await saveAll([{ doc, Model, isNew }]);
	} catch (e) {
		return saveFailure(e);
	}
	// Records whose formulas read this one through a link (`tax.amount`).
	if (!isNew) await recalculateDependents(req.app, Model, [doc._id], [...Object.keys(picked.body), ...formulas.map(f => f.key)]);
	recordHistory({ req, action: isNew ? 'create' : 'update', model: Model.modelName, modelPath: def.route, doc: doc.toObject(), note: '— through the AI assistant' } as any);
	const status = isDraftModel(def) ? statusOf(doc.toObject()) : null;
	const where = status
		? status === 'published'
			? 'It’s live as it is.'
			: `Saved as a draft — the site and API keep ${status === 'draft' ? 'not showing it' : 'what was published'} until it’s published (publish_entry, when the user says so).`
		: 'This model has no drafts — it’s live now.';
	return {
		text: `/${def.route}: ${isNew ? 'made' : 'changed'} [${doc._id}]. ${where}${picked.skipped.length ? `\nIgnored (not fields here): ${picked.skipped.join(', ')}` : ''}\nIn the panel: ${caller.page(`${def.route}/${doc._id}`)}`,
		data: { route: def.route, _id: String(doc._id), created: isNew, status, before: before && clean(before) },
	};
};

/* ------------------------------------------------------------ publish_entry */

const publishEntry = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const m = await contentModel(String(args?.route || '').trim());
	if (m.error) return refuse(m.error);
	const { def, Model } = m as { def: any; Model: mongoose.Model<any> };
	if (!isDraftModel(def)) return refuse(`/${def.route} has no drafts — its records are live as soon as they’re saved.`);
	if (!caller.allows(`publish-${def.route}`)) return refuse(`${caller.user.name || 'The key’s owner'} can’t publish /${def.route} — their role needs Publish there.`);
	const action = args?.action === 'unpublish' ? 'unpublish' : 'publish';
	let ids: string[] = (Array.isArray(args?.ids) ? args.ids : args?.id ? [args.id] : []).map(String).filter((x: string) => /^[a-f0-9]{24}$/i.test(x));
	if (!ids.length && def.kind === 'single') {
		const one: any = await Model.findOne({ archivedAt: null }, { _id: 1 }).lean();
		if (one) ids = [String(one._id)];
	}
	if (!ids.length) return refuse('Say which records: ids (from get_entry or query_records).');
	if (ids.length > MAX_PUBLISH) return refuse(`At most ${MAX_PUBLISH} at a time.`);
	if (args?.at !== undefined || args?.clear) return scheduleEntries(req, def, Model, ids, action, args);
	const done: string[] = [];
	const missing: string[] = [];
	for (const id of ids) {
		const out: any = action === 'publish' ? await publishRecord(Model, id, req.user) : await unpublishRecord(Model, id);
		if (!out) {
			missing.push(id);
			continue;
		}
		const doc: any = await Model.findById(id).lean();
		afterPublish(Model, action, action === 'publish' ? out.doc : doc);
		recordHistory({ req, action: 'update', model: Model.modelName, modelPath: def.route, doc, did: action === 'publish' ? 'published {it}' : 'took {it} off the site', note: 'through the AI assistant' } as any);
		done.push(`${doc?.[displayFieldOf(def)] || id}`);
	}
	return {
		text: `/${def.route}: ${done.length} ${action === 'publish' ? 'published — live on the site and API now' : 'taken off — the drafts stay'}${done.length ? ` (${done.slice(0, 20).join(', ')}${done.length > 20 ? '…' : ''})` : ''}.${missing.length ? `\nNot found: ${missing.join(', ')}` : ''}`,
		data: { route: def.route, action, done: done.length, missing },
	};
};

/** publish_entry with `at` (or `clear`): the times set, moved or cleared (docs/cms D7) — applied by the minute tick. */
const scheduleEntries = async (req: any, def: any, Model: mongoose.Model<any>, ids: string[], action: 'publish' | 'unpublish', args: any): Promise<Out> => {
	const key = action === 'publish' ? 'publishAt' : 'unpublishAt';
	const at = args.clear ? null : args.at;
	const done: string[] = [];
	const problems: string[] = [];
	for (const id of ids) {
		try {
			await setSchedule(def, Model, id, { [key]: at }, req.user);
			done.push(id);
		} catch (e: any) {
			if (!(e instanceof ScheduleError)) throw e;
			problems.push(`${id}: ${e.message}`);
		}
	}
	const when = at ? new Date(at).toISOString() : '';
	const verb = action === 'publish' ? 'publish' : 'come off';
	return {
		text: [
			done.length ? (at ? `/${def.route}: ${done.length} set to ${verb} at ${when} (UTC) — the draft as it is then.` : `/${def.route}: ${done.length} no longer scheduled to ${verb}.`) : '',
			problems.length ? `Not scheduled:\n${problems.join('\n')}` : '',
		].filter(Boolean).join('\n'),
		data: { route: def.route, action, at: at || null, done, problems },
		isError: !done.length,
	};
};

/* -------------------------------------------------------- page contents */

/** The website's Pages record for a path ("/" — or "site" for what's on every page), with Contents. */
const pageAndContents = async (req: any, ref: any) => {
	await ensureTypedContents(req);
	const [pages, contents] = await Promise.all([kitModel(KIT_ROUTES.pages), kitModel(KIT_ROUTES.contents)]);
	if (!pages || !contents) return { error: 'This website has no Pages or Contents model (it was renamed or deleted).' };
	const s = String(ref ?? '').trim();
	if (s === 'site') return { page: null, contents };
	const path = s.startsWith('/') ? s : `/${s}`;
	const find = () => pages.Model.findOne({ archivedAt: null, ...(/^[a-f0-9]{24}$/i.test(s) ? { _id: s } : { path }) }, { name: 1, path: 1 }).lean();
	let page: any = await find();
	// A site builder page not linked to its Pages record yet gets one, as the builder makes it.
	if (!page) {
		const built: any = await SitePage.findOne({ path, deletedAt: null }).lean();
		if (built && (await pushPage(built))) page = await find();
	}
	if (!page) return { error: `No page “${s}” — list_content_types lists the pages (or "site" for what’s on every page).` };
	return { page, contents };
};

const onPage = (page: any) => (page ? { page: page._id } : { $or: [{ page: null }, { page: { $exists: false } }] });

const getPageContents = async (req: any, args: any, caller: Caller): Promise<Out> => {
	if (!caller.allows(`view-${KIT_ROUTES.contents}`)) return refuse(`${caller.user.name || 'The key’s owner'} can’t see the site’s contents.`);
	const p = await pageAndContents(req, args?.page);
	if (p.error) return refuse(p.error);
	const { page, contents } = p as any;
	const types = new Map((await contentTypes()).map((t: any) => [t.uid, t]));
	const rows: any[] = await contents.Model.find({ archivedAt: null, ...onPage(page) }).sort({ order: 1, createdAt: 1 }).lean();
	const items = rows.map(r => {
		const b = Array.isArray(r.block) ? r.block[0] : null;
		const t: any = b ? types.get(b.__component) : null;
		const { _key, __component, ...data } = b || {};
		return b
			? { _id: String(r._id), name: r.name, type: t?.name || __component, status: contents.def.draftAndPublish ? statusOf(r) : null, data, fields: (t?.fields || []).map(fieldLine) }
			: { _id: String(r._id), name: r.name, legacy: true, slug: r.slug };
	});
	const where = page ? `${page.name} (${page.path})` : 'every page (header, footer)';
	return {
		text: [
			`Contents on ${where}, in order:`,
			...items.map((x: any, i) =>
				x.legacy
					? `${i + 1}. [${x._id}] ${x.name} — an older one-word record (slug ${x.slug}); set_site_contents changes it`
					: `${i + 1}. [${x._id}] ${x.type} “${x.name}”${x.status ? ` — ${STATUS_WORDS[x.status]}` : ''}\n   fields: ${x.fields.join(', ')}\n   now: ${JSON.stringify(x.data)}`
			),
			...(items.length ? [] : ['(none yet)']),
			'\nfill_page writes new words for these by id (only the fields that change), as drafts.',
		].join('\n'),
		data: { page: page && { _id: String(page._id), name: page.name, path: page.path }, items },
	};
};

/* ---------------------------------------------------------------- fill_page */

const fillPage = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const missing = ['create', 'edit'].filter(a => !caller.allows(`${a}-${KIT_ROUTES.contents}`));
	if (missing.length) return refuse(`${caller.user.name || 'The key’s owner'} can’t ${missing.join(' or ')} the site’s contents.`);
	const p = await pageAndContents(req, args?.page);
	if (p.error) return refuse(p.error);
	const { page, contents } = p as any;
	const sections: any[] = Array.isArray(args?.sections) ? args.sections : [];
	if (!sections.length) return refuse('Send sections: [{ id, data }] to change one (get_page_contents shows them), or [{ type, name, data }] to add one.');
	if (sections.length > MAX_SECTIONS) return refuse(`At most ${MAX_SECTIONS} sections a call.`);
	const types = await contentTypes();
	const typeOf = (name: any) => types.find((t: any) => t.uid === name || t.name === name);
	const last: any = await contents.Model.findOne({ archivedAt: null, ...onPage(page) }, { order: 1 }).sort({ order: -1 }).lean();
	let order = (last?.order ?? -1) + 1;
	const where = page ? slugPart(page.path === '/' ? 'home' : page.name) || 'page' : 'site';
	const problems: string[] = [];
	const docs: { doc: any; Model: mongoose.Model<any>; isNew: boolean; label: string }[] = [];
	for (let i = 0; i < sections.length; i++) {
		const s = sections[i] || {};
		const at = `sections[${i}]`;
		if (s.id) {
			const doc: any = /^[a-f0-9]{24}$/i.test(String(s.id)) ? await contents.Model.findOne({ _id: s.id, archivedAt: null, ...onPage(page) }) : null;
			const b = doc && Array.isArray(doc.block) ? doc.block[0] : null;
			const t: any = b && typeOf(b.__component);
			if (!doc) {
				problems.push(`${at}: no content ${s.id} on this page`);
				continue;
			}
			if (!t) {
				problems.push(`${at}: ${s.id} is an older one-word record — set_site_contents changes it`);
				continue;
			}
			const keys = new Set((t.fields || []).map((f: any) => f.key));
			const unknown = Object.keys(s.data || {}).filter(k => !keys.has(k));
			if (unknown.length) problems.push(`${at}: ${t.name} has no ${unknown.join(', ')} — its fields: ${[...keys].join(', ')}`);
			const { _key, __component, ...now } = typeof b.toObject === 'function' ? b.toObject() : b;
			const data = { ...now, ...Object.fromEntries(Object.entries(s.data || {}).filter(([k]) => keys.has(k))) };
			doc.set({ ...(s.name && { name: String(s.name).slice(0, 120) }), block: [{ __component: t.uid, _key, ...data }, ...doc.block.slice(1).map((x: any) => x?.toObject?.() ?? x)] });
			docs.push({ doc, Model: contents.Model, isNew: false, label: `changed ${t.title} “${doc.name}”` });
		} else {
			const t: any = typeOf(s.type);
			if (!t) {
				problems.push(`${at}: say the id of a content to change, or a type to add: ${types.map((x: any) => x.name).join(', ')}`);
				continue;
			}
			const keys = new Set((t.fields || []).map((f: any) => f.key));
			const data = Object.fromEntries(Object.entries(s.data || {}).filter(([k]) => keys.has(k)));
			const name = String(s.name || '').trim().slice(0, 120) || `${page?.name || 'Whole site'} — ${t.title}`;
			const doc = new contents.Model({
				name,
				...(page && { page: page._id }),
				slug: `${where}-${t.name}-${crypto.randomBytes(3).toString('hex')}`.slice(0, 120),
				type: t.uid,
				order: order++,
				block: [{ __component: t.uid, ...data }],
				addedBy: req.user?._id,
			});
			docs.push({ doc, Model: contents.Model, isNew: true, label: `added ${t.title} “${name}”` });
		}
	}
	for (const d of docs) problems.push(...validationProblems(d.doc, `${d.label}: `));
	if (problems.length) return refuse(`Nothing saved:\n- ${problems.slice(0, 40).join('\n- ')}`);
	try {
		await saveAll(docs);
	} catch (e) {
		return saveFailure(e);
	}
	for (const d of docs) recordHistory({ req, action: d.isNew ? 'create' : 'update', model: contents.def.name, modelPath: KIT_ROUTES.contents, doc: d.doc.toObject(), note: '— through the AI assistant' } as any);
	const added = docs.filter(d => d.isNew).length;
	return {
		text: [
			`${page ? `${page.name} (${page.path})` : 'Every page'}: ${docs.map(d => d.label).join('; ')}.`,
			contents.def.draftAndPublish ? 'Saved as drafts — the site shows them after Publish (the user publishes the site, or publish_entry on web-contents when they say so).' : 'Saved.',
			...(added ? [`${added} new — place ${added === 1 ? 'it' : 'them'} on the page in the site builder (they’re listed under Contents) so the site draws ${added === 1 ? 'it' : 'them'}.`] : []),
		].join('\n'),
		data: { page: page && page.path, saved: docs.map(d => ({ _id: String(d.doc._id), created: d.isNew })) },
	};
};

/* --------------------------------------------------------------- suggest_seo */

const suggestSeo = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const ref = String(args?.page || '').trim();
	const site: any = /^[a-f0-9]{24}$/i.test(ref)
		? await SitePage.findOne({ _id: ref, deletedAt: null }).lean()
		: await SitePage.findOne({ path: ref.startsWith('/') ? ref : `/${ref}`, deletedAt: null }).lean();
	if (!site) return refuse(`No page “${ref}” — get_site_builder lists them.`);
	const [page] = await pullSeo([site]);
	const seo = page?.draft?.seo || {};
	const words: string[] = [];
	wordsIn(page?.draft?.tree || [], words);
	const p = await pageAndContents(req, page.path);
	if (!p.error) {
		const rows: any[] = await (p as any).contents.Model.find({ archivedAt: null, ...onPage((p as any).page) }, { block: 1 }).sort({ order: 1 }).lean();
		for (const r of rows) wordsIn(r.block, words);
	}
	const text = [...new Set(words)].join(' · ').slice(0, 4000);
	const isTemplate = page.kind === 'template';
	return {
		text: [
			`${page.name} (${page.path})${isTemplate ? ` — a template page for each ${page.source?.model} record: use {{record.<field>}} in the title and description` : ''}`,
			`Now: title “${seo.title || ''}” (${(seo.title || '').length} characters) · description “${seo.description || ''}” (${(seo.description || '').length})${seo.image ? ` · share image ${seo.image}` : ''}${seo.noIndex ? ' · hidden from search' : ''}`,
			`The page’s words: ${text || '(none yet)'}`,
			'\nWrite: a title of 50–60 characters (the page’s subject first, the site name after a “—” only if it fits) and a description of 140–160 characters that says what a visitor gets. Show the user, then save with save_site_page { path, seo: { title, description } } — it’s a draft until the site is published.',
		].join('\n'),
		data: { path: page.path, seo: { title: seo.title || '', description: seo.description || '', image: seo.image || '' }, words: text },
	};
};

/* ------------------------------------------------------------------ tools */

export const CONTENT_TOOLS: ToolDef[] = [
	{
		name: 'list_content_types',
		title: 'List the content',
		description:
			'The project’s content: models with Drafts and publishing and single types — their fields, how many records, how many never published or with changes not published, and whether the key’s owner may publish them. In a website project also its pages (with how many contents each) and the page content types fill_page writes. Start here.',
		scope: 'read',
		only: 'project',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: listContentTypes,
	},
	{
		name: 'get_entry',
		title: 'Read an entry',
		description:
			'One record of a content model: its draft (what the panel edits), and — when it has changes not published — what the site and API show now, with the fields that differ. By `id`, by `match` {field: value} (e.g. {"slug": "spring-menu"}), or a single type by its route alone.',
		scope: 'data',
		only: 'project',
		inputSchema: {
			type: 'object',
			required: ['route'],
			properties: {
				route: { type: 'string', description: 'The model’s route (list_content_types shows them)' },
				id: { type: 'string' },
				match: { type: 'object', description: 'One field and its value, e.g. {"slug": "spring-menu"}' },
			},
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: getEntry,
	},
	{
		name: 'save_entry_draft',
		title: 'Save an entry’s draft',
		description:
			'Makes a record, or changes one (by `id` or `match`; a single type by its route alone), checked like its form: unknown fields ignored, required ones and allowed values enforced, links by the linked record’s id or name. On a model with drafts it stays a draft — the site and API don’t change until it’s published. Never publishes. Send only the fields that change.',
		scope: 'build',
		only: 'project',
		inputSchema: {
			type: 'object',
			required: ['route', 'data'],
			properties: {
				route: { type: 'string' },
				id: { type: 'string', description: 'The record to change; leave out (with match) to make a new one' },
				match: { type: 'object', description: 'Find the record by one field, e.g. {"slug": "spring-menu"}' },
				data: { type: 'object', description: 'Field key → value' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: saveEntryDraft,
	},
	{
		name: 'publish_entry',
		title: 'Publish entries',
		description:
			'Puts records’ drafts live on the site and API (or, with action "unpublish", takes them off — the drafts stay), now or — with `at` — at a time (get_entry shows what’s scheduled). ONLY when the user has asked in this conversation to publish these entries: never on your own, never as a step of writing them. Tell them what goes live first. Needs the key’s publish scope and the person’s Publish right on the model. Sends the project’s publish webhooks and refreshes the site.',
		scope: 'publish',
		ownRight: true,
		only: 'project',
		inputSchema: {
			type: 'object',
			required: ['route'],
			properties: {
				route: { type: 'string' },
				ids: { type: 'array', items: { type: 'string' }, description: `Up to ${MAX_PUBLISH}; a single type needs none` },
				action: { type: 'string', enum: ['publish', 'unpublish'], description: 'Default publish' },
				at: { type: 'string', description: 'A future date and time (ISO 8601 with its offset, e.g. 2026-11-02T09:00:00+06:00): schedule it then instead of now — the draft as it is then goes live. With action "unpublish": when it comes off.' },
				clear: { type: 'boolean', description: 'Cancel the waiting scheduled publish (or, with action "unpublish", take-off)' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		run: publishEntry,
	},
	{
		name: 'get_page_contents',
		title: 'Read a page’s contents',
		description:
			'A website page’s contents (its hero, text, cards, questions…) in order: each one’s id, type, the type’s fields, its words now and whether it’s live. `page` is a path ("/", "/about") or "site" for what’s on every page (header, footer). fill_page changes them by id.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', required: ['page'], properties: { page: { type: 'string' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: getPageContents,
	},
	{
		name: 'fill_page',
		title: 'Fill a page’s contents',
		description:
			'Writes a website page’s contents from the user’s brief, as drafts: `sections` [{ id, data }] changes one (only the fields sent; get_page_contents shows ids and fields), [{ type, name, data }] adds one at the end (hero, text, rich-text, cards, faq, stats, testimonials, gallery, video, cta, logos, image…). Checked first — nothing is saved if one is wrong. Never publishes; new ones still need placing in the site builder.',
		scope: 'build',
		only: 'website',
		inputSchema: {
			type: 'object',
			required: ['page', 'sections'],
			properties: {
				page: { type: 'string', description: 'A path ("/", "/about") or "site"' },
				sections: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'string', description: 'A content to change' },
							type: { type: 'string', description: 'A content type to add' },
							name: { type: 'string', description: 'Its name in the panel' },
							data: { type: 'object', description: 'The type’s fields → values; a list (items) is sent whole' },
						},
					},
				},
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: fillPage,
	},
	{
		name: 'suggest_seo',
		title: 'Material for a page’s SEO',
		description:
			'A website page’s words (its blocks and contents) and its SEO title and description now, with their lengths and what good ones look like — to write a better title and description. Read-only: show the user, then save with save_site_page { path, seo }.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', required: ['page'], properties: { page: { type: 'string', description: 'A path, e.g. "/about"' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: suggestSeo,
	},
];

/** How the AI works with content (docs/cms D-AI) — added to a project's server instructions. */
export const CONTENT_INSTRUCTIONS = `

CONTENT (drafts first). Models with Drafts and publishing keep every record as a draft until someone publishes it: list_content_types shows them, get_entry reads one (draft and live), save_entry_draft writes drafts, and on a website get_page_contents + fill_page write a page's words, suggest_seo gives material for its title and description. These never publish. publish_entry puts drafts live — only when the user has asked for it in this conversation; say what goes live first. "Publish it on Monday at 9" is publish_entry with at (ask their time zone if it isn't clear). After writing, tell the user what's waiting to be published and where to see it in the panel.`;
