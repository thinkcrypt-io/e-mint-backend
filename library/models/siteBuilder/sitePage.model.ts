import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One page of a site built with the site builder (docs/site-builder D6, D7).
 * One shared, scoped collection for every project — never one per project.
 *
 * The page's own fields (name, path, layout, menu, kind, source) and `draft`
 * are what the editor changes; every change bumps `draft.rev` (optimistic
 * concurrency: a save with an old rev gets 409). `published` is the copy the
 * live site renders — written only by Publish, with the page's fields as they
 * were then, so renaming or moving a draft never touches the live page.
 * Deleting sets `deletedAt` (the live page stays until the next Publish,
 * which removes it for good).
 */
const seo = {
	title: { type: String, default: '' },
	description: { type: String, default: '' },
	image: { type: String, default: '' },
	noIndex: { type: Boolean, default: false },
	canonical: { type: String, default: '' },
	keywords: { type: [String], default: [] },
	// SB-31: the rest of the AGS VSeo (siteBuilder/site.ts EMPTY_SEO)
	focusKeyword: { type: String, default: '' },
	ogTitle: { type: String, default: '' },
	ogDescription: { type: String, default: '' },
	ogType: { type: String, default: '' },
	ogImageAlt: { type: String, default: '' },
	twitterCard: { type: String, default: '' },
	twitterTitle: { type: String, default: '' },
	twitterDescription: { type: String, default: '' },
	twitterImage: { type: String, default: '' },
	noFollow: { type: Boolean, default: false },
	noArchive: { type: Boolean, default: false },
	noImageIndex: { type: Boolean, default: false },
	maxSnippet: { type: Number, default: -1 },
	maxImagePreview: { type: String, default: 'large' },
	schemaType: { type: String, default: 'auto' },
	schemaJson: { type: String, default: '' },
	breadcrumbTitle: { type: String, default: '' },
	/** The structured data form's values for schemaType (docs/seo SEO-04). */
	schemaData: { type: Schema.Types.Mixed, default: {} },
	sitemapInclude: { type: Boolean, default: true },
	sitemapPriority: { type: Number, default: 0.7 },
	sitemapChangeFrequency: { type: String, default: 'weekly' },
};

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		/** '/', '/about', '/blog/[slug]' */
		path: { type: String, required: true, trim: true },
		kind: { type: String, enum: ['static', 'template'], default: 'static' },
		/** Template pages (SB-09): { model, match: { param, field } } */
		source: { type: Schema.Types.Mixed, default: null },
		/** A key of SiteDesign.layouts; 'none' = no header or footer. */
		layout: { type: String, default: 'default' },
		showInMenu: { type: Boolean, default: false },
		menuLabel: { type: String, default: '' },
		priority: { type: Number, default: 0 },
		/** Exactly one per project, at '/'. */
		isHome: { type: Boolean, default: false },
		draft: {
			tree: { type: Schema.Types.Mixed, default: [] },
			seo,
			rev: { type: Number, default: 1 },
			updatedAt: { type: Date, default: Date.now },
			updatedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
			/** When the page's SEO record (kit /seo) was last copied in or written (siteBuilder/kit.ts) */
			seoSyncedAt: { type: Date, default: null },
		},
		/** { tree, seo, rev, version, publishedAt, name, path, kind, source, layout, showInMenu, menuLabel, priority } */
		published: { type: Schema.Types.Mixed, default: null },
		/** draft: never published or taken down and edited; published: live; unpublished: taken down (Publish skips it). */
		status: { type: String, enum: ['draft', 'published', 'unpublished'], default: 'draft' },
		deletedAt: { type: Date, default: null },
		/** The project's Pages record (kit /pages) that stands for this page — its SEO record points at it (D27). */
		kitPage: { type: Schema.Types.ObjectId, default: null },
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
// Unique among a project's live pages; deleted ones carry their deletedAt.
schema.index({ organization: 1, project: 1, path: 1, deletedAt: 1 }, { unique: true });
schema.index({ project: 1, 'published.path': 1 });
schema.index({ project: 1, isHome: 1 });

export default mongoose.model<any>('SitePage', schema, 'sitepages');
