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
			/**
			 * The site's whole colour palette (Site setup → General → Theme). primaryColor /
			 * secondaryColor above stay in step with palette.primary / .secondary for sites
			 * that read only those.
			 */
			palette: {
				primary: str,
				onPrimary: str,
				secondary: str,
				accent: str,
				background: str,
				surface: str,
				border: str,
				text: str,
				mutedText: str,
			},
			/** The ready palette it started from (a preset id), or '' when made by hand. */
			paletteName: str,
			/** Google Fonts names: headings, and body text (fontFamily mirrors bodyFont). */
			headingFont: str,
			bodyFont: str,
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
			/** Addresses the sitemap lists besides Mint's pages: '/old-page' or a full address on the site (docs/seo SEO-08). */
			sitemapExtra: { type: [String], default: [] },
			robots: str,
			/** robots.txt (docs/seo SEO-09): 'built' from these settings, or 'custom' = robotsFile exactly. */
			robotsMode: { type: String, enum: ['built', 'custom'], default: 'built' },
			robotsFile: { type: String, default: '' },
			/** Crawlers blocked in built mode, by id (robots.function.ts CRAWLERS). */
			robotsBlock: { type: [String], default: [] },
			canonicalDomain: str,
			googleVerification: str,
			bingVerification: str,
			/** The rest of Default SEO's editor (SB-33): social, indexing, structured data, sitemap — the AGS VSeo shape. */
			defaults: { type: mongoose.Schema.Types.Mixed, default: undefined },
		},
		tracking: {
			mintAnalytics: { type: Boolean, default: true },
			/** Visitors' IP addresses in analytics (WO-56): whole, the last part zeroed, or not kept. */
			visitorIp: { type: String, enum: ['full', 'masked', 'off'], default: 'full' },
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
		/**
		 * The Cloudflare Worker in front of the site (docs/site-connect SC-10): `bypass` turns all its rewriting off
		 * at once; robots.txt and sitemap.xml are answered from Mint only when switched on (the site's own stay otherwise).
		 */
		edge: {
			bypass: { type: Boolean, default: false },
			robots: { type: Boolean, default: false },
			sitemap: { type: Boolean, default: false },
		},
		/**
		 * An existing site connected to Mint (docs/site-connect D1, docs/seo-panel D4–D7): how it's connected and how
		 * far the SEO panel's setup got. `status`: setup → live (passed the test) → attention (a later check failed;
		 * editing stays open) / removed (disconnected; the setup gate closes again).
		 */
		connection: {
			type: new Schema(
				{
					mode: { type: String, enum: ['script', 'code', 'cloudflare'] },
					siteUrl: { type: String, trim: true },
					hostnames: { type: [String], default: undefined },
					status: { type: String, enum: ['setup', 'live', 'attention', 'removed'], default: 'setup' },
					/** The wizard step reached (1–5), so the owner comes back where they left. */
					step: { type: Number, min: 1, max: 5, default: 1 },
					/** What the address check found (platform, Cloudflare, current SEO, snippet) — shown on step 1–2. */
					detected: { type: Schema.Types.Mixed, default: undefined },
					/** The TXT value asked for on the Cloudflare way: `mint-verify=<project id>`. */
					txt: { type: String, trim: true },
					verifiedAt: Date,
					liveAt: Date,
					lastCheckAt: Date,
					/** The last connection test's answer (siteConnection.function.ts), for the status card. */
					lastCheck: { type: Schema.Types.Mixed, default: undefined },
					attentionReason: { type: String, trim: true },
					/** The Worker's health ping (SP-09): when it last asked Mint for its settings, and its version. */
					edgeSeenAt: Date,
					edgeVersion: { type: String, trim: true },
				},
				{ _id: false }
			),
			default: undefined,
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
