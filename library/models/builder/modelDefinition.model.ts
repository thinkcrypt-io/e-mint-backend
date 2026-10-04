import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A Mongoose model built in the admin's model builder instead of in code.
 *
 * On boot, and whenever one changes, each active definition is compiled into
 * a real Mongoose model (`name`, over `collectionName`) and gets an admin
 * route at `/admin/api/<route>` built by the same `defineRoutes` every code
 * model uses — see library/functions/dynamicModels.function.ts.
 *
 * `name`, `route` and `collectionName` are fixed at creation: the collection
 * holds the data, and other models reference this one by `name` (`ref`), so
 * renaming either would orphan something. `title` is free to change.
 */

const fieldSchema = new Schema<any>(
	{
		key: { type: String, required: true, trim: true },
		label: { type: String, trim: true },
		kind: { type: String, required: true },
		required: { type: Boolean, default: false },
		unique: { type: Boolean, default: false },
		index: { type: Boolean, default: false },
		default: { type: Schema.Types.Mixed },
		options: [{ _id: false, value: String, label: String }],
		/** For reference kinds: the Mongoose model name linked to. */
		ref: { type: String, trim: true },
		min: { type: Number },
		max: { type: Number },
		showInTable: { type: Boolean, default: true },
		searchable: { type: Boolean },
		helper: { type: String, trim: true },
		/** For the formula kind: the calculation, e.g. `total - paid`. */
		formula: { type: String, trim: true },
		/** For section kinds: the section's own fields, shaped like these (no links or nested sections). */
		fields: { type: [Schema.Types.Mixed], default: undefined },
		/** For a section list: its add button's text. */
		addLabel: { type: String, trim: true },
	},
	{ _id: false, minimize: false }
);

const schema = new Schema<any>(
	{
		/** The registered Mongoose model name, e.g. 'Invoice' or 'Invoice2'. */
		name: { type: String, required: true, trim: true },
		/** What was asked for, when `name` had to differ because it was taken. */
		requestedName: { type: String, trim: true },
		/** The admin route (and API path), e.g. 'invoices'. */
		route: { type: String, required: true, trim: true, lowercase: true },
		collectionName: { type: String, required: true, unique: true, trim: true },
		title: { type: String, required: true, trim: true },
		description: { type: String, trim: true },
		/** Permission key: view-/create-/edit-/delete-<permission>. */
		permission: { type: String, required: true, trim: true, lowercase: true },
		/** The field that names a record wherever it's linked (menus, tables). */
		displayField: { type: String, trim: true },
		code: {
			enabled: { type: Boolean, default: false },
			prefix: { type: String, trim: true, uppercase: true },
			padding: { type: Number, default: 4 },
			start: { type: Number, default: 1 },
		},
		/** Per-record access: an owner, a privacy (only me / private / public) and an access list on every record. */
		access: {
			enabled: { type: Boolean, default: false },
			default: { type: String, enum: ['private', 'only-me', 'public'], default: 'private' },
		},
		/**
		 * The model's public API for a tenant project's own site or app
		 * (docs/multi-tenancy WO-11): /public/api/<project>/<route>. Which actions
		 * answer, whether they need a signed-in customer of the project, and
		 * whether each customer only reaches their own records.
		 */
		publicApi: {
			enabled: { type: Boolean, default: false },
			actions: { type: [String], enum: ['list', 'get', 'create', 'update', 'delete'], default: undefined },
			auth: { type: String, enum: ['none', 'customer'], default: 'none' },
			ownerOnly: { type: Boolean, default: false },
			/** What the site or app uses it for — shown in the API reference (a template's endpoint note, T-09). */
			note: { type: String, trim: true, maxlength: 300, default: '' },
		},
		fields: { type: [fieldSchema], default: [] },
		active: { type: Boolean, default: true },
		/** Bumped on every change; a process rebuilds its copy when it differs. */
		version: { type: Number, default: 1 },
		sidebarItem: { type: Schema.Types.ObjectId, ref: 'SidebarItem' },
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

// Tenant documents carry organization/project; every query is confined to its scope (docs/multi-tenancy).
schema.plugin(tenantScoped);
// Names and routes are unique per scope (the super admin's, or one project's);
// a tenant model is compiled under an internal name (D6). Collections are global.
schema.index({ organization: 1, project: 1, name: 1 }, { unique: true });
schema.index({ organization: 1, project: 1, route: 1 }, { unique: true });

export default mongoose.model<any>('ModelDefinition', schema, 'modeldefinitions');
