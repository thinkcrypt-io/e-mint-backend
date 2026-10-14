import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import RecordComment from '../library/models/tenancy/recordComment.model.js';
import TenantUser from '../library/models/tenancy/tenantUser.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import RouteConfig from '../library/models/builder/routeConfig.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { accessRule, isAccessRestricted } from '../library/functions/recordAccess.function.js';
import { scopedModel } from '../library/functions/routeRegistry.function.js';
import { displayFieldOf } from '../library/functions/dynamicModels.function.js';
import { later, notifyTenant, projectAudience, projectHrefFor } from '../library/functions/tenantNotify.function.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';

/**
 * /tenant/api/p/:projectId/comments — talking about one record (docs/multi-tenancy
 * WO-49): the record page's Comments tab, with @mentions.
 *
 *   GET    /?route&record                 the thread, oldest first, and the page's switches
 *   GET    /mentionable?route&record      who can be @mentioned on this record, and who can't
 *   POST   /                              { route, record, body, mentions: [userId], parent? }
 *   PUT    /:id                           { body, mentions }   your own comment
 *   DELETE /:id                           your own; Manage projects deletes anyone's (a comment's replies go with it)
 *
 * Replies (WO-53) are one level deep, like Facebook: `parent` is a top-level
 * comment, and a reply to a reply joins that same thread. Everyone in the
 * thread — its first comment's writer and whoever replied — hears about a new
 * reply, as long as they can still see the record (the @mentioned hear about
 * the mention instead).
 *
 * Everything needs Records: View on the page, and the record itself in sight
 * (an access-restricted record: its owner, or shared with you). Who can be
 * mentioned follows who can see the record:
 *
 *   public (or a page without per-record access)  anyone in the project who views the page
 *   private                                        of those, the owner and the people it's shared with
 *   only me                                        no one — the owner alone sees it
 *
 * Mentioning anyone else is refused with a 400 that names them. Comments and
 * mentions each turn off per page (WO-50) — on its Fields & rules tab, kept in
 * its published config as `route.comments` / `route.mentions`; on unless off.
 */
const router = express.Router({ mergeParams: true });

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));
const same = (a: any, b: any) => !!a && !!b && String(a?._id || a) === String(b?._id || b);

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

type Switches = { comments: boolean; mentions: boolean };
type Target = { route: string; def: any; Model: mongoose.Model<any>; doc: any; restricted: boolean; title: string; settings: Switches };

/** A page's comments and mentions switches (WO-50), from its published config; mentions need comments. */
const switchesOf = async (route: string): Promise<Switches> => {
	const c: any = await RouteConfig.findOne({ route }, { 'data.route.comments': 1, 'data.route.mentions': 1 }).lean();
	const r = c?.data?.route || {};
	const comments = r.comments !== false;
	return { comments, mentions: comments && r.mentions !== false };
};

/** The page and record a request is about — 404 unless this person may see both. */
const loadTarget = async (req: any, route: any, record: any): Promise<Target> => {
	const r = String(route || '').toLowerCase();
	if (!/^[a-z0-9-]+$/.test(r) || !isId(record)) throw new TenancyError(404, 'Record not found');
	if (!grants(req.permissions, [`view-${r}`])) throw new TenancyError(403, 'Your role can’t view this page');
	const def: any = await ModelDefinition.findOne({ route: r }).lean();
	const Model = def && scopedModel(def.name);
	if (!Model) throw new TenancyError(404, 'Comments are for the records of your project’s own pages');
	const restricted = isAccessRestricted(Model);
	const doc: any = await Model.findOne({ _id: record, ...(restricted && accessRule(req.user._id)) }).lean();
	if (!doc) throw new TenancyError(404, 'Record not found');
	const field = displayFieldOf(def);
	const name = field && field !== '_id' ? doc[field] : '';
	const noun = def.title ? String(def.title).replace(/s$/i, '') : def.name;
	return {
		route: r,
		def,
		Model,
		doc,
		restricted,
		title: typeof name === 'string' && name.trim() ? `${noun} “${name.trim()}”` : noun.toLowerCase(),
		settings: await switchesOf(r),
	};
};

type Mentionable = {
	/** everyone: anyone on the page; private: the owner and who it's shared with; none: Only me. */
	mode: 'everyone' | 'private' | 'none';
	people: { _id: string; name: string; email: string }[];
	/** In the project and on the page, but not allowed to see this record. */
	blocked: { _id: string; name: string; email: string }[];
};

/** Who can be @mentioned on a record — never the writer themselves. */
const mentionable = async (req: any, t: Target): Promise<Mentionable> => {
	const audience = (await projectAudience({ organization: req.organization._id, project: req.project._id, permission: `view-${t.route}` })).map(String);
	const privacy = t.restricted ? t.doc.privacy || 'private' : 'public';
	const mode: Mentionable['mode'] = privacy === 'only-me' ? 'none' : privacy === 'private' ? 'private' : 'everyone';
	const sees = new Set<string>(
		mode === 'everyone' ? audience : mode === 'private' ? [t.doc.addedBy, ...(t.doc.access || [])].filter(Boolean).map(String) : []
	);
	const users: any[] = await TenantUser.find({ _id: { $in: audience }, isActive: { $ne: false } }, { name: 1, email: 1 }).sort({ name: 1 }).lean();
	const view = (u: any) => ({ _id: String(u._id), name: u.name || u.email, email: u.email });
	const others = users.filter(u => !same(u._id, req.user._id));
	return { mode, people: others.filter(u => sees.has(String(u._id))).map(view), blocked: others.filter(u => !sees.has(String(u._id))).map(view) };
};

/** The mentions a comment may carry, or a 400 that says why not. */
const checkMentions = async (req: any, t: Target, ids: string[]) => {
	const wanted = [...new Set(ids.map(String))].filter(id => !same(id, req.user._id));
	if (!wanted.length) return [];
	if (!t.settings.mentions) throw new TenancyError(400, 'Mentions are turned off for this page (its Fields & rules).', 'mentions_off');
	const m = await mentionable(req, t);
	if (m.mode === 'none') throw new TenancyError(400, 'This record is Only me — no one else can see it, so no one can be mentioned.', 'not_mentionable');
	const ok = new Map(m.people.map(p => [p._id, p]));
	const refused = wanted.filter(id => !ok.has(id));
	if (refused.length) {
		const known = new Map([...m.blocked].map(p => [p._id, p.name]));
		const names = refused.map(id => known.get(id) || 'Someone').join(', ');
		throw new TenancyError(
			400,
			m.mode === 'private'
				? `${names} can’t be mentioned — this record is private and they don’t have access to it.`
				: `${names} can’t be mentioned — they don’t work on this page in this project.`,
			'not_mentionable'
		);
	}
	return wanted.map(id => ({ user: id, name: ok.get(id)!.name }));
};

const view = (c: any) => ({
	_id: String(c._id),
	route: c.route,
	record: String(c.record),
	author: { _id: String(c.author), name: c.authorName || 'Someone' },
	body: c.body,
	mentions: (c.mentions || []).map((m: any) => ({ _id: String(m.user), name: m.name })),
	parent: c.parent ? String(c.parent) : null,
	createdAt: c.createdAt,
	editedAt: c.editedAt || null,
});

const excerptOf = (body: string) => (body.length > 140 ? `${body.slice(0, 137)}…` : body);
/** A comment's link: the record's Comments tab, opened at the comment. */
const hrefOf = (req: any, t: Target, comment: any) => projectHrefFor(req.project, `/${t.route}/${t.doc._id}?tab=comments&comment=${comment._id}`);

/** Tells the newly mentioned, after the response. */
const notifyMentions = (req: any, t: Target, comment: any, users: any[]) => {
	if (!users.length) return;
	later(async () => {
		const href = await hrefOf(req, t, comment);
		await notifyTenant(
			users.map(u => ({
				recipient: u,
				organization: req.organization._id,
				project: req.project._id,
				actor: req.user._id,
				actorName: req.user.name,
				type: 'mention',
				title: `${req.user.name || 'Someone'} mentioned you on ${t.title}`,
				message: excerptOf(comment.body),
				href,
				route: t.route,
				record: t.doc._id,
			}))
		);
	});
};

/**
 * Tells a thread's people about a new reply, after the response: the first
 * comment's writer and everyone who replied before — not the writer, not the
 * people this reply @mentions (they hear about that), and only those who can
 * still see the record.
 */
const notifyReply = (req: any, t: Target, top: any, reply: any, mentioned: any[]) => {
	later(async () => {
		const earlier: any[] = await RecordComment.find({ parent: top._id, _id: { $ne: reply._id } }, { author: 1 }).lean();
		const skip = new Set([String(req.user._id), ...mentioned.map(String)]);
		const wanted = [...new Set([top.author, ...earlier.map(c => c.author)].map(String))].filter(id => !skip.has(id));
		if (!wanted.length) return;
		const sees = new Set((await mentionable(req, t)).people.map(p => p._id));
		const users = wanted.filter(id => sees.has(id));
		if (!users.length) return;
		const href = await hrefOf(req, t, reply);
		const who = req.user.name || 'Someone';
		await notifyTenant(
			users.map(u => ({
				recipient: u,
				organization: req.organization._id,
				project: req.project._id,
				actor: req.user._id,
				actorName: req.user.name,
				type: 'reply',
				title: same(u, top.author) ? `${who} replied to your comment on ${t.title}` : `${who} replied to a comment on ${t.title}`,
				message: excerptOf(reply.body),
				href,
				route: t.route,
				record: t.doc._id,
			}))
		);
	});
};

const commentsOn = (t: Target) => {
	if (!t.settings.comments) throw new TenancyError(403, 'Comments are turned off for this page (its Fields & rules).', 'comments_off');
};

router.get(
	'/',
	handle(async req => {
		const t = await loadTarget(req, req.query.route, req.query.record);
		const docs = await RecordComment.find({ route: t.route, record: t.doc._id }).sort({ createdAt: 1 }).limit(500).lean();
		return {
			doc: docs.map(view),
			total: docs.length,
			settings: t.settings,
			canModerate: grants(req.permissions, ['manage-projects']),
		};
	})
);

router.get(
	'/mentionable',
	handle(async req => {
		const t = await loadTarget(req, req.query.route, req.query.record);
		const on = t.settings.mentions;
		return { enabled: on, ...(on ? await mentionable(req, t) : { mode: 'none', people: [], blocked: [] }) };
	})
);

const bodySchema = {
	body: Joi.string().trim().min(1).max(5000).required().messages({ 'any.required': 'Write a comment', 'string.empty': 'Write a comment' }),
	mentions: Joi.array().items(Joi.string()).max(20).default([]),
};

router.post(
	'/',
	rateLimit({ name: 'tenant-comments', windowMs: 60 * 1000, max: 60 }),
	handle(async req => {
		const input = check(
			Joi.object({ route: Joi.string().required(), record: Joi.string().required(), parent: Joi.string().allow(null, ''), ...bodySchema }),
			req.body
		);
		const t = await loadTarget(req, input.route, input.record);
		commentsOn(t);
		// A reply: to a comment on this same record; a reply to a reply joins its thread.
		let top: any = null;
		if (input.parent) {
			const p: any = isId(input.parent) && (await RecordComment.findOne({ _id: input.parent, route: t.route, record: t.doc._id }).lean());
			if (!p) throw new TenancyError(404, 'The comment you’re replying to was deleted', 'parent_gone');
			top = p.parent ? await RecordComment.findById(p.parent).lean() : p;
			if (!top) throw new TenancyError(404, 'The comment you’re replying to was deleted', 'parent_gone');
		}
		const mentions = await checkMentions(req, t, input.mentions);
		const comment: any = await RecordComment.create({
			route: t.route,
			record: t.doc._id,
			author: req.user._id,
			authorName: req.user.name,
			body: input.body,
			mentions,
			parent: top?._id || null,
		});
		notifyMentions(req, t, comment, mentions.map(m => m.user));
		if (top) notifyReply(req, t, top, comment, mentions.map(m => m.user));
		return view(comment);
	})
);

/** A comment of this project, with its page and record still in sight. */
const loadComment = async (req: any) => {
	if (!isId(req.params.id)) throw new TenancyError(404, 'Comment not found');
	const comment: any = await RecordComment.findById(req.params.id);
	if (!comment) throw new TenancyError(404, 'Comment not found');
	const t = await loadTarget(req, comment.route, comment.record);
	return { comment, t };
};

router.put(
	'/:id',
	handle(async req => {
		const { comment, t } = await loadComment(req);
		commentsOn(t);
		if (!same(comment.author, req.user._id)) throw new TenancyError(403, 'You can only edit your own comments');
		const input = check(Joi.object(bodySchema), req.body);
		const mentions = await checkMentions(req, t, input.mentions);
		const before = new Set((comment.mentions || []).map((m: any) => String(m.user)));
		comment.body = input.body;
		comment.mentions = mentions;
		comment.editedAt = new Date();
		await comment.save();
		// Only the people this edit adds hear about it.
		notifyMentions(req, t, comment, mentions.map(m => m.user).filter(id => !before.has(String(id))));
		return view(comment);
	})
);

router.delete(
	'/:id',
	handle(async req => {
		const { comment } = await loadComment(req);
		if (!same(comment.author, req.user._id) && !grants(req.permissions, ['manage-projects']))
			throw new TenancyError(403, 'You can only delete your own comments');
		await RecordComment.deleteOne({ _id: comment._id });
		// A top-level comment takes its replies with it.
		const replies = comment.parent ? 0 : (await RecordComment.deleteMany({ parent: comment._id })).deletedCount || 0;
		return { message: replies ? `Comment and ${replies} ${replies === 1 ? 'reply' : 'replies'} deleted` : 'Comment deleted' };
	})
);

export default router;
