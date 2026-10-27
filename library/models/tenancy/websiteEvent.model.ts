import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One analytics event from a tenant's website (docs/multi-tenancy WO-19): a
 * page view, a click, or a custom event the site sent with
 * `MintAnalytics.track(name, props)`. Collected by /public/track.js through
 * POST /public/api/:slug/track; reported in the project's Analytics page.
 *
 * WO-56 added who and where: IP, ISP, region, timezone, language, screen,
 * device model, ad click ids, the visit's channel/source, time on page and
 * scroll depth, and the signed-in customer — see WebsiteVisitor for the
 * per-visitor summary.
 *
 * Not a builder model — there can be millions. Scoped like the builder's
 * documents (organization + project); kept 400 days.
 */
export const EVENT_TYPES = ['pageview', 'click', 'event'] as const;
/** Where a visit came from (WO-56) — set on a visit's entry page view. */
export const CHANNELS = ['Direct', 'Organic search', 'Paid search', 'Social', 'Paid social', 'Email', 'Referral', 'Paid other'] as const;
export const DEVICE_TYPES = ['desktop', 'mobile', 'tablet', 'other'] as const;

const schema = new Schema<any>(
	{
		type: { type: String, enum: EVENT_TYPES, required: true },
		/** A custom event's name; for clicks, the element's label. */
		name: { type: String, trim: true, maxlength: 120 },
		path: { type: String, trim: true, maxlength: 500 },
		title: { type: String, trim: true, maxlength: 300 },
		referrer: { type: String, trim: true, maxlength: 1000 },
		/** The referring site, or '' for direct / internal visits. */
		referrerHost: { type: String, trim: true, maxlength: 255 },
		/** The site the visit was on (the page's host, from the browser's Origin) — Analytics offers it as a domain. */
		host: { type: String, trim: true, lowercase: true, maxlength: 255 },
		utmSource: { type: String, trim: true, maxlength: 120 },
		utmMedium: { type: String, trim: true, maxlength: 120 },
		utmCampaign: { type: String, trim: true, maxlength: 120 },
		utmTerm: { type: String, trim: true, maxlength: 120 },
		utmContent: { type: String, trim: true, maxlength: 120 },
		/** An ad click id's network — gclid → google, fbclid → meta, msclkid → microsoft, ttclid → tiktok, … (WO-56). */
		clickId: { type: String, trim: true, maxlength: 20 },
		/** The first page view of a visit; only it carries the visit's channel and source. */
		entry: { type: Boolean },
		channel: { type: String, enum: CHANNELS },
		/** "Google", "Facebook", "Google Ads", "newsletter", a referring site… */
		source: { type: String, trim: true, maxlength: 80 },
		eventId: { type: String, trim: true, maxlength: 64 },
		/** Time on the page while it was visible (ms) and how far down it was read (%), sent when it's left. */
		duration: { type: Number },
		scroll: { type: Number },
		sessionId: { type: String, trim: true, maxlength: 64 },
		visitorId: { type: String, trim: true, maxlength: 64 },
		device: { type: String, enum: DEVICE_TYPES, default: 'other' },
		os: { type: String, trim: true, maxlength: 40 },
		browser: { type: String, trim: true, maxlength: 40 },
		country: { type: String, trim: true, maxlength: 80 },
		countryCode: { type: String, trim: true, maxlength: 4 },
		city: { type: String, trim: true, maxlength: 80 },
		region: { type: String, trim: true, maxlength: 80 },
		timezone: { type: String, trim: true, maxlength: 60 },
		/** The visitor's address — whole, masked (last part zeroed) or left out, as Site setup → Tracking says. */
		ip: { type: String, trim: true, maxlength: 64 },
		isp: { type: String, trim: true, maxlength: 120 },
		org: { type: String, trim: true, maxlength: 120 },
		asn: { type: Number },
		deviceModel: { type: String, trim: true, maxlength: 80 },
		language: { type: String, trim: true, maxlength: 20 },
		/** Screen size, "1440x900". */
		screen: { type: String, trim: true, maxlength: 20 },
		customer: { type: Schema.Types.ObjectId, ref: 'ProjectCustomer' },
		element: {
			tag: { type: String, trim: true, maxlength: 20 },
			text: { type: String, trim: true, maxlength: 200 },
			href: { type: String, trim: true, maxlength: 1000 },
			id: { type: String, trim: true, maxlength: 120 },
		},
		/** A custom event's properties (small; trimmed on the way in). */
		props: { type: Schema.Types.Mixed },
		createdAt: { type: Date, default: Date.now },
	},
	{ versionKey: false, minimize: true }
);

schema.plugin(tenantScoped);
schema.index({ project: 1, createdAt: -1 });
schema.index({ project: 1, type: 1, path: 1, createdAt: -1 });
schema.index({ project: 1, visitorId: 1, createdAt: -1 });
schema.index({ project: 1, eventId: 1 }, { partialFilterExpression: { eventId: { $type: 'string' } } });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export default mongoose.model<any>('WebsiteEvent', schema, 'websiteevents');
