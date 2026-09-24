import { Schema } from 'mongoose';

/**
 * The envelope RouteSettings and RouteConfig share: a published copy the API
 * serves, and a draft the builder edits. Nothing reads `draft` at runtime —
 * a change reaches the tables only when it's published, which copies it into
 * `data`, bumps `version` and snapshots the result as a RouteVersion.
 *
 * `data` and `draft` are Mixed on purpose: they are copies of code files
 * whose shape varies per route, and the builder API validates them with Joi
 * before they're written, which Mongoose's schema couldn't express anyway.
 * `minimize: false` keeps an empty object an object rather than dropping it.
 */
export const draftableSchema = () =>
	new Schema<any>(
		{
			// The admin path, exactly as the admin requests `${route}/get/...`.
			route: { type: String, required: true, trim: true, unique: true },
			// The base model's modelName.
			model: { type: String, trim: true },
			data: { type: Schema.Types.Mixed, default: null },
			draft: { type: Schema.Types.Mixed, default: null },
			version: { type: Number, default: 0 },
			publishedAt: { type: Date },
			publishedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
			draftUpdatedAt: { type: Date },
			draftUpdatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
			// Which copy the API runs on for this route: its published `data`
			// ('db'), its code file ('code'), or whatever the global switch in
			// BuilderState says ('inherit'). Takes effect immediately — it's an
			// operational switch, not a draft.
			source: { type: String, enum: ['inherit', 'db', 'code'], default: 'inherit' },
			sourceUpdatedAt: { type: Date },
			sourceUpdatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		},
		{ timestamps: true, versionKey: false, minimize: false }
	);
