import express from 'express';
import crypto from 'crypto';
import { TenancyError, handle, isId } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import recordHistory from '../library/functions/recordHistory.function.js';
import { dataModelOf } from '../library/functions/dynamicModels.function.js';
import { publishRecord, statusOf } from '../library/functions/drafts.function.js';
import { afterPublish } from '../library/functions/publishEvents.function.js';
import { KIT_ROUTES, kitModel } from '../library/siteBuilder/kit.js';
import { slugPart } from '../library/siteBuilder/connect.js';
import { BLOCKS_MAX, LIST_TYPE, START_TYPES, contentTypes, ensureTypedContents, nextTypes } from '../library/siteBuilder/contentTypes.js';
import { dataModels, readList } from '../library/siteBuilder/resolve.js';

/**
 * /tenant/api/p/:projectId/site-contents — the website's Contents, typed and
 * by page (docs/cms D1, CMS-06). One record per piece of a page — a Hero, a
 * row of Cards, Questions, a List of projects — its type chosen first; the
 * record keeps its words in `block` — first an item of that type, then any
 * more blocks added under it (`more`: a Text then a Gallery…) — and its place
 * in `order`. Older one-word-per-record contents are listed too, as they are.
 *
 *   GET    /types                 the content types (fields + form + what goes with each), what starts a page, and the models a List can show
 *   GET    /?page=<id>|site       the pages (with how many contents each) and one page's contents, in order
 *   POST   /                      { page, type, name?, slug?, data, more? } → a new record, last on its page
 *   PUT    /:id                   { name?, slug?, page?, data?, more? } — data replaces the type's fields, more the blocks under it
 *   DELETE /:id                   archived (the table's Archived view brings it back)
 *   POST   /order                 { ids } — their order on the page, first to last
 *   POST   /list-preview          { data } → the records a List would show now
 *   POST   /publish               { page } or { ids } → each not yet live published (drafts until Publish, D5)
 *
 * Reading needs to see Contents; changes need add / edit / delete on it.
 */
const router = express.Router({ mergeParams: true });
const ROUTE = KIT_ROUTES.contents;

const may = (req: any, action: 'view' | 'create' | 'edit' | 'delete' | 'publish') => {
	if (!grants(req.permissions, [`${action}-${ROUTE}`])) throw new TenancyError(403, `Your role can’t ${action === 'view' ? 'see' : action} the site’s contents`);
};

router.use((req: any, res: any, next: any) => {
	if (!['website', 'ecommerce'].includes(req.project?.type)) return res.status(404).json({ message: 'Only website and store projects have site contents' });
	next();
});

const kit = async (req: any) => {
	await ensureTypedContents(req);
	const k = await kitModel(ROUTE);
	if (!k) throw new TenancyError(404, 'This project has no Contents model (web-contents) — it was renamed or deleted');
	return k;
};

const pagesKit = async () => kitModel(KIT_ROUTES.pages);

const typeView = (t: any) => ({
	uid: t.uid,
	name: t.name,
	title: t.title,
	icon: t.icon || '',
	description: t.description || '',
	fields: t.fields || [],
	dataModel: dataModelOf(t.fields || []),
	/** The types that go well with it — offered first under it and after it on a page. */
	suggest: nextTypes(t.uid),
});

/** The first words of a record, for its row. */
const previewOf = (data: any) => {
	for (const k of ['heading', 'title', 'eyebrow', 'text', 'body', 'caption', 'buttonLabel']) {
		const v = data?.[k];
		if (typeof v === 'string' && v.trim()) return v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
	}
	const first = Array.isArray(data?.items) ? data.items.find((x: any) => x?.title) : null;
	return first ? String(first.title).slice(0, 120) : '';
};

const itemOf = (rec: any) => {
	const b = Array.isArray(rec?.block) ? rec.block[0] : null;
	if (!b) return null;
	const { _key, __component, ...data } = b;
	return { type: __component as string, key: _key as string, data };
};

/** The blocks added under the first, as the form edits them. */
const moreOf = (rec: any) => (Array.isArray(rec?.block) ? rec.block.slice(1) : []).map((b: any) => (typeof b?.toObject === 'function' ? b.toObject() : b));

const view = (rec: any, titles: Map<string, any>, drafts: boolean) => {
	const item = itemOf(rec);
	const type = item?.type || rec.type || '';
	const t = titles.get(type);
	return {
		_id: String(rec._id),
		name: rec.name || '',
		slug: rec.slug || '',
		page: rec.page ? String(rec.page?._id || rec.page) : null,
		order: rec.order ?? 0,
		type: item ? type : null,
		typeTitle: item ? t?.title || type : null,
		icon: item ? t?.icon || '' : '',
		data: item?.data || null,
		more: item ? moreOf(rec) : [],
		preview: item ? previewOf(item.data) : String(rec.content || rec.btnText || rec.richContent || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 120),
		/** One word per record, from before typed contents: edited in the table. */
		legacy: !item,
		category: item ? null : rec.category || null,
		...(drafts && { status: statusOf(rec), publishedAt: rec._publishedAt || null }),
		updatedAt: rec.updatedAt,
	};
};

const SITE = 'site';
const pageCond = (page: any) => (page === SITE || !page ? { $or: [{ page: null }, { page: { $exists: false } }] } : { page });

router.get(
	'/types',
	handle(async (req: any) => {
		may(req, 'view');
		await kit(req);
		const [types, models] = await Promise.all([contentTypes(), dataModels()]);
		return {
			types: types.map(typeView),
			/** Offered first for an empty page, and for the whole site. */
			start: START_TYPES,
			// What a List can show: models whose public API lists records for anyone (the site reads them as a visitor).
			models: models.filter(m => m.model !== ROUTE).map(m => ({ model: m.model, title: m.title, list: m.list, problem: m.problem, fields: m.fields })),
		};
	})
);

router.get(
	'/',
	handle(async (req: any) => {
		may(req, 'view');
		const k = await kit(req);
		const pk = await pagesKit();
		const page = req.query.page === SITE || !req.query.page ? SITE : String(req.query.page);
		if (page !== SITE && !isId(page)) throw new TenancyError(404, 'No such page');
		const [pages, counts, recs, types] = await Promise.all([
			pk ? pk.Model.find({ archivedAt: null }, { name: 1, path: 1, status: 1 }).sort({ path: 1 }).limit(300).lean() : [],
			k.Model.find({ archivedAt: null, migratedAt: { $exists: false } }, { page: 1 }).limit(5000).lean(),
			// (old one-word records the site has moved off stay for the live site until its next Publish — not listed)
			k.Model.find({ archivedAt: null, migratedAt: { $exists: false }, ...pageCond(page) })
				.select('+_published')
				.sort({ order: 1, createdAt: 1 })
				.limit(500)
				.lean(),
			contentTypes(),
		]);
		const n = new Map<string, number>();
		for (const c of counts as any[]) n.set(c.page ? String(c.page) : SITE, (n.get(c.page ? String(c.page) : SITE) || 0) + 1);
		const titles = new Map(types.map((t: any) => [t.uid, t]));
		const drafts = !!k.def.draftAndPublish;
		return {
			drafts,
			site: n.get(SITE) || 0,
			pages: (pages as any[]).map(p => ({ _id: String(p._id), name: p.name, path: p.path, status: p.status || null, count: n.get(String(p._id)) || 0 })),
			page,
			doc: recs.map((r: any) => {
				const { _published, ...rest } = r;
				return view(rest, titles, drafts);
			}),
		};
	})
);

const rand = () => crypto.randomBytes(4).toString('hex').slice(0, 6);

/** A page's Pages record, or null for the whole site. */
const pageRecord = async (page: any) => {
	if (page === null || page === undefined || page === '' || page === SITE) return null;
	const pk = await pagesKit();
	const rec: any = pk && isId(page) ? await pk.Model.findOne({ _id: page, archivedAt: null }, { name: 1, path: 1 }).lean() : null;
	if (!rec) throw new TenancyError(404, 'No such page');
	return rec;
};

/** The type's fields only, as the form sent them. */
const dataFor = (type: any, raw: any) => {
	const keys = new Set((type.fields || []).map((f: any) => f.key));
	return Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(([key]) => keys.has(key)));
};

/** The blocks to put under the first, as the form sent them: known types (not a List — it's a content of its own), their fields only, keys kept. */
const moreFor = (types: any[], raw: any) => {
	if (raw === undefined) return undefined;
	if (!Array.isArray(raw)) throw new TenancyError(400, 'Send more as a list of blocks');
	if (raw.length > BLOCKS_MAX - 1) throw new TenancyError(400, `One content holds at most ${BLOCKS_MAX} blocks`);
	return raw.map((b: any, i: number) => {
		const type: any = types.find((t: any) => t.uid === b?.__component);
		if (!type || type.uid === LIST_TYPE) throw new TenancyError(400, `Block ${i + 2}: ${b?.__component ? `“${b.__component}” isn’t a type that can go here` : 'say its type (__component)'}`);
		return { __component: type.uid, ...(typeof b._key === 'string' && b._key && { _key: b._key.slice(0, 40) }), ...dataFor(type, b) };
	});
};

/** A slug as it's stored, refused when another content has it (the site and the API find a content by it). */
const slugFor = async (k: any, raw: any, id?: any) => {
	const slug = String(raw || '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120);
	if (!slug) throw new TenancyError(400, 'A slug needs letters or numbers');
	if (await k.Model.exists({ slug, archivedAt: null, ...(id && { _id: { $ne: id } }) })) throw new TenancyError(400, `Another content already has the slug “${slug}”`);
	return slug;
};

/** A Mongoose validation error as one readable line. */
const saveError = (e: any) => {
	if (e?.name === 'ValidationError') return new TenancyError(400, Object.values<any>(e.errors).map(x => x.message).join('; '));
	return e;
};

router.post(
	'/',
	handle(async (req: any, res: any) => {
		may(req, 'create');
		const k = await kit(req);
		const body = req.body || {};
		const types = await contentTypes();
		const type: any = types.find((t: any) => t.uid === body.type);
		if (!type) throw new TenancyError(400, 'Choose what kind of content it is');
		const page = await pageRecord(body.page);
		const last: any = await k.Model.findOne({ archivedAt: null, ...pageCond(page?._id || SITE) }, { order: 1 }).sort({ order: -1 }).lean();
		const where = page ? slugPart(page.path === '/' ? 'home' : page.name) || 'page' : SITE;
		const name = String(body.name || '').trim().slice(0, 120) || `${page?.name || 'Whole site'} — ${type.title}`;
		const more = moreFor(types, body.more) || [];
		const slug = String(body.slug || '').trim() ? await slugFor(k, body.slug) : `${where}-${type.name}-${rand()}`.slice(0, 120);
		let doc: any;
		try {
			doc = await k.Model.create({
				name,
				...(page && { page: page._id }),
				slug,
				type: type.uid,
				order: (last?.order ?? -1) + 1,
				block: [{ __component: type.uid, ...dataFor(type, body.data) }, ...more],
				addedBy: req.user?._id,
			});
		} catch (e: any) {
			throw saveError(e);
		}
		recordHistory({ req, action: 'create', model: k.def.name, modelPath: ROUTE, doc: doc.toObject() });
		res.status(201);
		return view(doc.toObject(), new Map(types.map((t: any) => [t.uid, t])), !!k.def.draftAndPublish);
	})
);

router.post(
	'/order',
	handle(async (req: any) => {
		may(req, 'edit');
		const k = await kit(req);
		const ids: string[] = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x: any) => isId(x)).slice(0, 500);
		if (!ids.length) throw new TenancyError(400, 'Send { ids } in their new order');
		// Order only — the record's words (and so its draft) don't change.
		await k.Model.bulkWrite(ids.map((_id, order) => ({ updateOne: { filter: { _id, archivedAt: null }, update: { $set: { order } }, timestamps: false } })) as any);
		return { ok: true, order: ids };
	})
);

router.post(
	'/list-preview',
	handle(async (req: any) => {
		may(req, 'view');
		const out = await readList(req.body?.data || {}, { pageSize: 6 });
		return { ...out, items: out.items.map((x: any) => ({ _id: x._id, title: x.title ?? '', description: x.description ?? '', image: x.image ?? '', url: x.url ?? '' })) };
	})
);

router.post(
	'/publish',
	handle(async (req: any) => {
		may(req, 'publish');
		const k = await kit(req);
		if (!k.def.draftAndPublish) throw new TenancyError(400, 'Contents go live as soon as they’re saved here');
		const body = req.body || {};
		const ids = Array.isArray(body.ids) ? body.ids.filter((x: any) => isId(x)).slice(0, 500) : null;
		const page = ids ? null : body.page === SITE || !body.page ? SITE : String(body.page);
		if (page && page !== SITE && !isId(page)) throw new TenancyError(404, 'No such page');
		const recs: any[] = await k.Model.find({ archivedAt: null, ...(ids ? { _id: { $in: ids } } : pageCond(page)) }, { updatedAt: 1, _publishedAt: 1, _publishedFrom: 1 }).lean();
		let published = 0;
		for (const r of recs) {
			if (statusOf(r) === 'published') continue;
			const out = await publishRecord(k.Model, r._id, req.user);
			if (!out) continue;
			published++;
			afterPublish(k.Model, 'publish', out.doc);
		}
		return { message: published ? `${published} published` : 'Everything here is live already', published };
	})
);

const oneOf = async (k: any, id: string) => {
	if (!isId(id)) throw new TenancyError(404, 'Content not found');
	const doc: any = await k.Model.findOne({ _id: id, archivedAt: null });
	if (!doc) throw new TenancyError(404, 'Content not found');
	return doc;
};

router.put(
	'/:id',
	handle(async (req: any) => {
		may(req, 'edit');
		const k = await kit(req);
		const doc = await oneOf(k, req.params.id);
		const body = req.body || {};
		const types = await contentTypes();
		const titles = new Map(types.map((t: any) => [t.uid, t]));
		const changes: any[] = [];
		if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== doc.name) {
			changes.push({ field: 'name', label: 'Name', from: doc.name || '', to: body.name.trim() });
			doc.name = body.name.trim().slice(0, 120);
		}
		if (typeof body.slug === 'string' && body.slug.trim() && body.slug.trim() !== doc.slug) {
			const slug = await slugFor(k, body.slug, doc._id);
			if (slug !== doc.slug) {
				changes.push({ field: 'slug', label: 'Slug', from: doc.slug || '', to: slug });
				doc.slug = slug;
			}
		}
		if ('page' in body) {
			const page = await pageRecord(body.page);
			if (String(page?._id || '') !== String(doc.page || '')) {
				changes.push({ field: 'page', label: 'Page', from: String(doc.page || 'Whole site'), to: page?.name || 'Whole site' });
				doc.page = page?._id || null;
			}
		}
		if (body.data !== undefined || body.more !== undefined) {
			const item = itemOf(doc.toObject());
			if (!item) throw new TenancyError(400, 'This content is from before typed contents — change it in the table');
			const type: any = titles.get(item.type);
			if (!type) throw new TenancyError(400, `Its type (${item.type}) is gone — make the component again, or remove this content`);
			const now = { __component: item.type, _key: item.key, ...item.data };
			const next = body.data !== undefined ? { __component: item.type, _key: item.key, ...dataFor(type, body.data) } : now;
			const was = moreOf(doc.toObject());
			const more = moreFor(types, body.more) ?? was;
			if (JSON.stringify(next) !== JSON.stringify(now)) changes.push({ field: 'block', label: type.title, from: '', to: previewOf(next) || 'changed' });
			if (JSON.stringify(more) !== JSON.stringify(was))
				changes.push({ field: 'block', label: 'Blocks under it', from: String(was.length), to: more.map((b: any) => titles.get(b.__component)?.title || b.__component).join(', ') || 'none' });
			if (changes.some(c => c.field === 'block')) doc.block = [next, ...more];
		}
		if (changes.length)
			try {
				await doc.save();
			} catch (e: any) {
				throw saveError(e);
			}
		const saved = await k.Model.findById(doc._id).lean();
		recordHistory({ req, action: 'update', model: k.def.name, modelPath: ROUTE, doc: saved, changes });
		return view(saved, titles, !!k.def.draftAndPublish);
	})
);

router.delete(
	'/:id',
	handle(async (req: any) => {
		may(req, 'delete');
		const k = await kit(req);
		const doc = await oneOf(k, req.params.id);
		// Straight to the collection: archivedAt isn't one of the model's fields.
		await k.Model.collection.updateOne({ _id: doc._id }, { $set: { archivedAt: new Date(), archivedBy: req.user?._id || null } });
		recordHistory({ req, action: 'update', model: k.def.name, modelPath: ROUTE, doc: doc.toObject(), changes: [{ field: 'archivedAt', label: 'Archived', from: 'no', to: 'yes' }] });
		return { ok: true };
	})
);

export default router;
