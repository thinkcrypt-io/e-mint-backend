import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One visitor of a tenant's website (docs/multi-tenancy WO-56): the running
 * summary of a browser's events — first and last seen, visits, page views,
 * how they first arrived, where they are and on what, and who they are when
 * the site knows (a signed-in customer, or MintAnalytics.identify). Upserted
 * by POST /public/api/track with each batch, so the Visitors list never
 * aggregates the events; the journey itself is read from WebsiteEvent.
 *
 * Kept as long as the events (400 days after the last visit).
 */
const str = (max: number) => ({ type: String, trim: true, maxlength: max });

const placeSchema = new Schema(
	{
		ip: str(64),
		country: str(80),
		countryCode: str(4),
		region: str(80),
		city: str(80),
		timezone: str(60),
		lat: Number,
		lng: Number,
		isp: str(120),
		org: str(120),
		asn: Number,
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		visitorId: { ...str(64), required: true },
		firstSeen: { type: Date, default: Date.now },
		lastSeen: { type: Date, default: Date.now },
		visits: { type: Number, default: 0 },
		pageviews: { type: Number, default: 0 },
		events: { type: Number, default: 0 },
		/** The session the last batch came from — a new one counts a visit. */
		lastSessionId: str(64),
		lastPath: str(500),
		/** How they first arrived (their first visit's entry page view). */
		first: {
			channel: str(40),
			source: str(80),
			referrer: str(1000),
			landing: str(500),
			utmSource: str(120),
			utmMedium: str(120),
			utmCampaign: str(120),
			clickId: str(20),
		},
		/** The last visit's source. */
		lastChannel: str(40),
		lastSource: str(80),
		place: placeSchema,
		device: str(20),
		os: str(40),
		browser: str(40),
		deviceModel: str(80),
		language: str(20),
		screen: str(20),
		/** A signed-in site customer (their token checked on the way in). */
		customer: { type: Schema.Types.ObjectId, ref: 'ProjectCustomer' },
		/** Name and email: the customer's, or what the site sent with MintAnalytics.identify. */
		name: str(120),
		email: str(200),
		/** The site's own id for them (MintAnalytics.identify) — not checked. */
		userId: str(120),
	},
	{ versionKey: false, minimize: true }
);

schema.plugin(tenantScoped);
schema.index({ project: 1, visitorId: 1 }, { unique: true });
schema.index({ project: 1, lastSeen: -1 });
schema.index({ lastSeen: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export default mongoose.model<any>('WebsiteVisitor', schema, 'websitevisitors');
