import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A website project's settings (docs/multi-tenancy WO-38) — one document per
 * project, everything a site needs besides its pages: who it is (name, logo,
 * favicon, colours), how to reach it (contact, socials), its default SEO and
 * indexing, the tracking tags, server-side tracking, the code it adds to every
 * page, redirects and response headers. Modelled on AGS GlobalSettings.
 *
 * A fixed model, not a built one: it isn't a table in the panel and the model
 * builder can't change it. Edited on the panel's Site setup page and by the
 * MCP; read by the site API (/site, /site/tags, robots.txt, sitemap.xml) and
 * by track.js. Linked to its project by `project` (tenantScoped stamps it).
 *
 * `secrets` (server-side tracking keys) is never selected unless asked for,
 * and never leaves the server: the panel only learns whether each is set.
 */
const str = { type: String, trim: true, default: '' };

const tagSchema = new Schema(
	{
		name: { type: String, trim: true, maxlength: 80, required: true },
		/** Where it goes on the page. */
		location: { type: String, enum: ['head', 'bodyStart', 'bodyEnd'], default: 'head' },
		content: { type: String, maxlength: 20000, default: '' },
		enabled: { type: Boolean, default: true },
	},
	{ _id: true }
);

const schema = new Schema<any>(
	{
		identity: {
			siteName: str,
			tagline: str,
			logo: str,
			favicon: str,
			footerText: str,
			primaryColor: { type: String, trim: true, default: '#000000' },
			secondaryColor: { type: String, trim: true, default: '#ffffff' },
			fontFamily: { type: String, trim: true, default: 'Inter' },
		},
		contact: {
			email: str,
			phone: str,
			whatsapp: str,
			address: str,
			mapEmbedUrl: str,
			hours: str,
		},
		social: {
			facebook: str,
			instagram: str,
			x: str,
			linkedin: str,
			youtube: str,
			tiktok: str,
			pinterest: str,
		},
		seo: {
			metaTitle: str,
			/** e.g. "%s · Acme" — a page's title in place of %s. */
			titleTemplate: str,
			metaDescription: str,
			ogImage: str,
			keywords: { type: [String], default: [] },
			indexing: { type: Boolean, default: true },
			sitemap: { type: Boolean, default: true },
			robots: str,
			canonicalDomain: str,
			googleVerification: str,
			bingVerification: str,
		},
		tracking: {
			mintAnalytics: { type: Boolean, default: true },
			ga4: str,
			gtm: str,
			googleAds: str,
			metaPixel: str,
			tiktokPixel: str,
			linkedinPartner: str,
			pinterestTag: str,
			xPixel: str,
			snapPixel: str,
			clarity: str,
			hotjar: str,
		},
		/** Events sent from the server too (ad blockers, iOS limits); the keys are in `secrets`. */
		serverSide: {
			meta: {
				enabled: { type: Boolean, default: false },
				testEventCode: str,
			},
			ga4: {
				enabled: { type: Boolean, default: false },
			},
		},
		secrets: {
			type: new Schema({ metaAccessToken: str, ga4ApiSecret: str }, { _id: false }),
			default: () => ({}),
			select: false,
		},
		/** Code added to every page, by name — chat widgets, other tags, verification snippets. */
		headTags: { type: [tagSchema], default: [] },
		redirects: {
			type: [new Schema({ from: { type: String, trim: true }, to: { type: String, trim: true }, permanent: { type: Boolean, default: true } }, { _id: false })],
			default: [],
		},
		headers: {
			type: [new Schema({ source: { type: String, trim: true, default: '/(.*)' }, name: { type: String, trim: true }, value: { type: String, trim: true } }, { _id: false })],
			default: [],
		},
		/** The last "Check the site" (site.router.ts): what was found, per tag. */
		check: { type: Schema.Types.Mixed, default: undefined },
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
// One per project.
schema.index({ organization: 1, project: 1 }, { unique: true });

export default mongoose.model<any>('WebsiteSettings', schema, 'websitesettings');
