import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A builder site's look and shared parts (docs/site-builder D6, D10) — one per
 * project: the theme, token overrides, the colour scheme, layouts (header and
 * footer trees per layout key) and global sections. `draft` is edited (with a
 * `rev` like pages); `published` is what the live site renders, written by
 * Publish with the release `version`.
 *
 *   draft:     { theme, tokens, colorScheme, layouts: { [key]: { header, footer } }, sections: { [id]: { name, tree } }, rev }
 *   published: { …the same, version, publishedAt } | null
 */
const schema = new Schema<any>(
	{
		draft: { type: Schema.Types.Mixed, required: true },
		published: { type: Schema.Types.Mixed, default: null },
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1 }, { unique: true });

export default mongoose.model<any>('SiteDesign', schema, 'sitedesigns');
