import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One analytics event from a tenant's website (docs/multi-tenancy WO-19): a
 * page view, a click, or a custom event the site sent with
 * `MintAnalytics.track(name, props)`. Collected by /public/track.js through
 * POST /public/api/:slug/track; reported in the project's Analytics page.
 *
 * Not a builder model — there can be millions. Scoped like the builder's
 * documents (organization + project); kept 400 days.
 */
export const EVENT_TYPES = ['pageview', 'click', 'event'] as const;
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
		utmSource: { type: String, trim: true, maxlength: 120 },
		utmMedium: { type: String, trim: true, maxlength: 120 },
		utmCampaign: { type: String, trim: true, maxlength: 120 },
		sessionId: { type: String, trim: true, maxlength: 64 },
		visitorId: { type: String, trim: true, maxlength: 64 },
		device: { type: String, enum: DEVICE_TYPES, default: 'other' },
		os: { type: String, trim: true, maxlength: 40 },
		browser: { type: String, trim: true, maxlength: 40 },
		country: { type: String, trim: true, maxlength: 80 },
		countryCode: { type: String, trim: true, maxlength: 4 },
		city: { type: String, trim: true, maxlength: 80 },
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
schema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export default mongoose.model<any>('WebsiteEvent', schema, 'websiteevents');
