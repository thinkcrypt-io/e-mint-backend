import mongoose, { Schema } from 'mongoose';

/**
 * A project template (docs/templates, TD1): a blueprint the super admin keeps
 * — models, pages, sidebar, dashboard, roles, public API, website pages and
 * settings, sample data, questions and a setup guide. Saving one builds
 * nothing; it is built only into a sandbox preview or a new project.
 *
 * Not tenantScoped: templates belong to the platform. `draft` is what the
 * studio and the Templates MCP edit; publishing copies it into `versions`
 * and `published` (TD5), so a live template never changes under a tenant.
 */
export const TEMPLATE_TYPES = ['app', 'api', 'website'] as const;
export const TEMPLATE_STATUSES = ['draft', 'published', 'archived'] as const;
export const TEMPLATE_VISIBILITY = ['everyone', 'organizations', 'hidden'] as const;
export const TEMPLATE_SOURCES = ['panel', 'mcp', 'starter', 'capture', 'import'] as const;

const version = new Schema<any>(
	{
		version: { type: Number, required: true },
		blueprint: { type: Schema.Types.Mixed, required: true },
		notes: { type: String, trim: true, maxlength: 2000 },
		publishedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		publishedAt: { type: Date, default: Date.now },
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		/** Stable slug: what projects and the starters API name it by. */
		key: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 60 },
		type: { type: String, enum: TEMPLATE_TYPES, required: true },
		/** draft until first published; archived ones are hidden from new projects. */
		status: { type: String, enum: TEMPLATE_STATUSES, default: 'draft' },
		/** Copied from the draft's overview on save, so lists don't read blueprints. */
		name: { type: String, required: true, trim: true, maxlength: 80 },
		summary: { type: String, trim: true, maxlength: 300 },
		category: { type: String, trim: true, maxlength: 60 },
		icon: { type: String, trim: true, maxlength: 40 },
		color: { type: String, trim: true, maxlength: 30 },
		cover: { type: String, trim: true, maxlength: 1000 },
		visibility: { type: String, enum: TEMPLATE_VISIBILITY, default: 'everyone' },
		organizations: { type: [Schema.Types.ObjectId], ref: 'Organization', default: [] },
		draft: { type: Schema.Types.Mixed, required: true },
		/** The current version's blueprint (null until published). */
		published: { type: Schema.Types.Mixed, default: null },
		/** 0 = never published. */
		version: { type: Number, default: 0 },
		versions: { type: [version], default: [] },
		/** The draft changed since the last publish. */
		changed: { type: Boolean, default: true },
		usage: {
			previews: { type: Number, default: 0 },
			applied: { type: Number, default: 0 },
			lastAppliedAt: { type: Date },
		},
		/** How the draft last checked — counts only, for the gallery's "has problems" badge. */
		checks: {
			errors: { type: Number, default: 0 },
			explain: { type: Number, default: 0 },
			warnings: { type: Number, default: 0 },
			at: { type: Date },
		},
		source: { type: String, enum: TEMPLATE_SOURCES, default: 'panel' },
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
	},
	{ timestamps: true, minimize: false }
);
schema.index({ status: 1, type: 1 });

export default mongoose.model<any>('ProjectTemplate', schema, 'projecttemplates');
