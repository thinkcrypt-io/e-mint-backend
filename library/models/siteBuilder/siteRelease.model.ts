import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One Publish of a builder site (docs/site-builder D7): a full snapshot of
 * the published design and pages, so any release can be restored. Versions
 * count up per project; the last 50 are kept.
 *
 *   pages: [{ page, name, path, kind, source, layout, showInMenu, menuLabel, priority, isHome, tree, seo }]
 */
const schema = new Schema<any>(
	{
		version: { type: Number, required: true },
		note: { type: String, trim: true, maxlength: 300, default: '' },
		publishedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		publishedByName: { type: String, default: '' },
		publishedAt: { type: Date, default: Date.now },
		/** Restoring an older release writes a new one that says which. */
		restoredFrom: { type: Number, default: null },
		design: { type: Schema.Types.Mixed, required: true },
		pages: { type: Schema.Types.Mixed, default: [] },
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, version: 1 }, { unique: true });

export default mongoose.model<any>('SiteRelease', schema, 'sitereleases');
