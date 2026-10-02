import mongoose, { Schema } from 'mongoose';

/**
 * A workspace inside an organization (docs/multi-tenancy, D3): its own built
 * models, pages, sidebar, dashboard, MCP keys and public API. `type: 'website'`
 * projects are seeded with the website kit (D13). `publicSlug` is global — it
 * names the project in the public API (`/public/api/<publicSlug>/…`).
 */
export const PROJECT_TYPES = ['app', 'website'] as const;
/** Whose media library a project uses (WO-23): its own, or the organization's shared one. */
export const MEDIA_SCOPES = ['project', 'organization'] as const;

const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
		name: { type: String, required: true, trim: true, maxlength: 80 },
		slug: { type: String, required: true, trim: true, lowercase: true },
		publicSlug: { type: String, required: true, unique: true, trim: true, lowercase: true },
		type: { type: String, enum: PROJECT_TYPES, default: 'app' },
		description: { type: String, trim: true, maxlength: 500 },
		icon: { type: String, trim: true },
		color: { type: String, trim: true },
		/** Website projects: the site's domains (analytics origin check, CORS). */
		domains: { type: [String], default: undefined },
		mediaScope: { type: String, enum: MEDIA_SCOPES, default: 'project' },
		/** Website projects: tags, head/body code, SEO, redirects, headers (WO-34, siteConfig.function.ts). */
		site: { type: Schema.Types.Mixed, default: undefined },
		isActive: { type: Boolean, default: true },
		createdBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
	},
	{ timestamps: true }
);
schema.index({ organization: 1, slug: 1 }, { unique: true });

export default mongoose.model<any>('TenantProject', schema, 'tenantprojects');
