import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A PDF template (docs/pdf-templates): the blocks a page's records print
 * with, checked by library/functions/pdfTemplates/schema.ts before every
 * save. The super admin's templates marked `gallery.published` are the
 * starters every project can copy (D6); `key` names a built-in starter.
 */
const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		description: { type: String, default: '' },
		kind: { type: String, default: 'other' },
		route: { type: String, default: '', index: true },
		alias: { type: String, default: 'record' },
		isDefault: { type: Boolean, default: false },
		/** Draft or published (PT-33): only published ones are offered where the page downloads PDFs. None (older ones) = published. */
		status: { type: String, enum: ['draft', 'published'], default: undefined },
		page: { type: Schema.Types.Mixed, default: {} },
		style: { type: Schema.Types.Mixed, default: {} },
		lists: { type: [Schema.Types.Mixed], default: [] },
		header: { type: [Schema.Types.Mixed], default: [] },
		body: { type: [Schema.Types.Mixed], default: [] },
		footer: { type: [Schema.Types.Mixed], default: [] },
		/** Placed freely on the page (docs D22). */
		free: { type: [Schema.Types.Mixed], default: undefined },
		slots: { type: [Schema.Types.Mixed], default: undefined },
		sample: { type: Schema.Types.Mixed, default: undefined },
		key: { type: String, default: undefined },
		/** Where it came from: a gallery template's id or a starter's key. */
		from: { type: String, default: undefined },
		gallery: { published: { type: Boolean, default: false }, order: { type: Number, default: 0 } },
		createdBy: { type: Schema.Types.ObjectId },
		updatedBy: { type: Schema.Types.ObjectId },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, route: 1 });

export default mongoose.model<any>('PdfTemplate', schema, 'pdftemplates');
