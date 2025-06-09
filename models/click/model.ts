import mongoose, { Schema, Document } from 'mongoose';

export interface IClick extends Document {
	[key: string]: any;
}

const clickSchema = new Schema<IClick>(
	{
		elementType: {
			type: String,
			default: 'other',
			required: true,
			trim: true,
		},
		elementName: {
			type: String,
			required: true,
			trim: true,
		},
		elementId: { type: String, trim: true },
		elementSlug: {
			type: String,
			trim: true,
		},
		sessionId: {
			type: String,
			trim: true,
		},
		elementText: { type: String, trim: true },
		elementHref: { type: String, trim: true },
		elementTag: {
			type: String,
			default: 'other',
			trim: true,
		},
		pageSlug: { type: String, trim: true },

		pageTitle: { type: String, trim: true },
		ipAddress: { type: String, trim: true },
		userAgent: { type: String, trim: true },
		locationCity: { type: String, trim: true },
		locationCountry: { type: String, trim: true },
		locationRegion: { type: String, trim: true },
		deviceType: {
			type: String,
			enum: ['desktop', 'mobile', 'tablet', 'other'],
			default: 'other',
			trim: true,
		},
		deviceBrand: { type: String, trim: true },
		deviceModel: { type: String, trim: true },
		deviceOs: { type: String, trim: true },
		deviceBrowser: { type: String, trim: true },
		locationCountryCode: { type: String, trim: true },
		locationRegionCode: { type: String, trim: true },
		locationTimeZone: { type: String, trim: true },
		locationIsSP: { type: String, default: false },
		referrer: { type: String, trim: true },
		customref: { type: String, trim: true },
		utmSource: { type: String, trim: true },
		clickType: {
			type: String,
			enum: ['click', 'hover', 'focus', 'submit', 'other'],
			default: 'click',
			trim: true,
		},
		eventCategory: {
			type: String,
			enum: ['navigation', 'engagement', 'conversion', 'social', 'download', 'other'],
			default: 'other',
			trim: true,
		},
		eventName: { type: String, trim: true },
		conversionType: {
			type: String,
			trim: true,
		},
		isBot: { type: Boolean, default: false },
		botName: { type: String, trim: true },
		tags: [{ type: String, trim: true }],
		fbclid: { type: String, trim: true },
	},
	{
		timestamps: true,
	}
);

const Click = mongoose.model<IClick>('Click', clickSchema);

export default Click;
