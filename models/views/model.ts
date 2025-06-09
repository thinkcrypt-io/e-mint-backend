import mongoose, { Schema } from 'mongoose';

export type ViewType = any;

const schema = new Schema<ViewType>(
	{
		// Page Information
		pageSlug: {
			type: String,
			required: [true, 'Page slug is required'],
			trim: true,
			default: '/',
			index: true,
		},
		pageTitle: {
			type: String,
			trim: true,
		},
		pageUrl: {
			type: String,
			trim: true,
		},

		// Visitor Information
		ipAddress: {
			type: String,
			trim: true,
			index: true,
		},
		userAgent: {
			type: String,
			trim: true,
		},
		fingerprint: {
			type: String,
			trim: true,
			index: true,
		},
		sessionId: {
			type: String,
			trim: true,
			index: true,
		},

		// Device Information (flattened)
		deviceType: {
			type: String,
			enum: ['desktop', 'tablet', 'mobile', 'unknown'],
			default: 'unknown',
			required: true,
		},
		deviceBrand: {
			type: String,
			trim: true,
		},
		deviceModel: {
			type: String,
			trim: true,
		},
		deviceOs: {
			type: String,
			trim: true,
		},
		deviceOsVersion: {
			type: String,
			trim: true,
		},
		deviceBrowser: {
			type: String,
			trim: true,
		},
		deviceBrowserVersion: {
			type: String,
			trim: true,
		},
		deviceScreenResolution: {
			type: String,
			trim: true,
		},
		deviceViewportWidth: {
			type: Number,
			min: 0,
		},
		deviceViewportHeight: {
			type: Number,
			min: 0,
		},

		// Geolocation Information (flattened)
		locationCountry: {
			type: String,
			trim: true,
			index: true,
		},
		locationCountryCode: {
			type: String,
			trim: true,
			uppercase: true,
			maxlength: 2,
		},
		locationRegion: {
			type: String,
			trim: true,
		},
		locationRegionCode: {
			type: String,
			trim: true,
		},
		locationCity: {
			type: String,
			trim: true,
			index: true,
		},

		locationTimezone: {
			type: String,
			trim: true,
		},
		locationLatitude: {
			type: Number,
			min: -90,
			max: 90,
		},
		locationLongitude: {
			type: Number,
			min: -180,
			max: 180,
		},
		locationIsp: {
			type: String,
			trim: true,
		},
		locationOrganization: {
			type: String,
			trim: true,
		},
		locationProxy: {
			type: Boolean,
			default: false,
		},
		locationVpn: {
			type: Boolean,
			default: false,
		},
		locationTor: {
			type: Boolean,
			default: false,
		},

		// Traffic Information
		referrer: {
			type: String,
			trim: true,
		},
		customRef: {
			type: String,
			trim: true,
		},
		referrerDomain: {
			type: String,
			trim: true,
			index: true,
		},
		utmSource: {
			type: String,
			trim: true,
			index: true,
		},
		utmMedium: {
			type: String,
			trim: true,
		},
		utmCampaign: {
			type: String,
			trim: true,
		},
		utmTerm: {
			type: String,
			trim: true,
		},
		utmContent: {
			type: String,
			trim: true,
		},

		// Visit Tracking
		isUniqueVisitor: {
			type: Boolean,
			required: true,
			default: false,
			index: true,
		},
		isReturnVisitor: {
			type: Boolean,
			required: true,
			default: false,
			index: true,
		},
		visitCount: {
			type: Number,
			required: true,
			default: 1,
			min: 1,
		},
		previousVisitDate: {
			type: Date,
		},
		sessionDuration: {
			type: Number,
			min: 0,
		},
		timeOnPage: {
			type: Number,
			min: 0,
		},

		// Engagement Metrics (flattened)
		bounceRate: {
			type: Boolean,
			default: false,
		},
		exitPage: {
			type: Boolean,
			default: false,
		},
		pagesPerSession: {
			type: Number,
			min: 1,
			default: 1,
		},
		interactionClicks: {
			type: Number,
			default: 0,
			min: 0,
		},
		interactionScrollDepth: {
			type: Number,
			default: 0,
			min: 0,
			max: 100,
		},
		interactionDownloads: {
			type: Number,
			default: 0,
			min: 0,
		},
		interactionFormSubmissions: {
			type: Number,
			default: 0,
			min: 0,
		},

		// Technical Information
		language: {
			type: String,
			trim: true,
			lowercase: true,
		},
		acceptLanguage: {
			type: String,
			trim: true,
		},
		encoding: {
			type: String,
			trim: true,
		},
		colorDepth: {
			type: Number,
			min: 1,
		},
		pixelRatio: {
			type: Number,
			min: 0,
		},
		touchSupport: {
			type: Boolean,
			default: false,
		},
		cookieEnabled: {
			type: Boolean,
			default: true,
		},
		javaEnabled: {
			type: Boolean,
			default: false,
		},

		// Business Intelligence
		isBot: {
			type: Boolean,
			default: false,
			index: true,
		},
		botName: {
			type: String,
			trim: true,
		},
		isDevelopment: {
			type: Boolean,
			default: false,
		},
		isPreview: {
			type: Boolean,
			default: false,
		},

		// Analytics Tags
		tags: [
			{
				type: String,
				trim: true,
			},
		],
		customAttributesLabel: {
			type: String,
			trim: true,
		},
		customAttributesValue: {
			type: String,
			trim: true,
		},

		// Visit Date
		visitDate: {
			type: Date,
			required: true,
			default: Date.now,
			index: true,
		},
	},
	{
		timestamps: true,
	}
);

// Virtual for getting visitor's approximate location string
schema.virtual('locationString').get(function () {
	const parts = [];
	if (this.locationCity) parts.push(this.locationCity);
	if (this.locationRegion) parts.push(this.locationRegion);
	if (this.locationCountry) parts.push(this.locationCountry);
	return parts.join(', ') || 'Unknown Location';
});

// Virtual for getting device string
schema.virtual('deviceString').get(function () {
	const parts = [];
	if (this.deviceBrand) parts.push(this.deviceBrand);
	if (this.deviceModel) parts.push(this.deviceModel);
	if (this.deviceOs) {
		const os = this.deviceOsVersion ? `${this.deviceOs} ${this.deviceOsVersion}` : this.deviceOs;
		parts.push(`(${os})`);
	}
	return parts.join(' ') || 'Unknown Device';
});

// Virtual for getting browser string
schema.virtual('browserString').get(function () {
	if (this.deviceBrowser) {
		return this.deviceBrowserVersion
			? `${this.deviceBrowser} ${this.deviceBrowserVersion}`
			: this.deviceBrowser;
	}
	return 'Unknown Browser';
});

// Pre-save middleware to process and enrich data
schema.pre<ViewType>('save', function (next) {
	// Set device type based on user agent if not provided
	if (!this.deviceType || this.deviceType === 'unknown') {
		const ua = this.userAgent.toLowerCase();
		if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
			this.deviceType = 'mobile';
		} else if (ua.includes('tablet') || ua.includes('ipad')) {
			this.deviceType = 'tablet';
		} else {
			this.deviceType = 'desktop';
		}
	}

	// Detect common bots
	if (!this.isBot) {
		const botPatterns = [
			'googlebot',
			'bingbot',
			'slurp',
			'duckduckbot',
			'baiduspider',
			'yandexbot',
			'facebookexternalhit',
			'twitterbot',
			'linkedinbot',
			'whatsapp',
			'telegram',
			'crawler',
			'spider',
			'bot',
		];
		const ua = this.userAgent.toLowerCase();
		this.isBot = botPatterns.some(pattern => ua.includes(pattern));

		if (this.isBot && !this.botName) {
			const detectedBot = botPatterns.find(pattern => ua.includes(pattern));
			if (detectedBot) {
				this.botName = detectedBot.charAt(0).toUpperCase() + detectedBot.slice(1);
			}
		}
	}

	// Extract referrer domain
	if (this.referrer && !this.referrerDomain) {
		try {
			const url = new URL(this.referrer);
			this.referrerDomain = url.hostname;
		} catch (e) {
			// Invalid URL, keep referrerDomain undefined
		}
	}

	next();
});

// Static method to get analytics summary
schema.statics.getAnalyticsSummary = async function (options: {
	startDate?: Date;
	endDate?: Date;
	pageSlug?: string;
	country?: string;
}) {
	const match: any = {};

	if (options.startDate || options.endDate) {
		match.visitDate = {};
		if (options.startDate) match.visitDate.$gte = options.startDate;
		if (options.endDate) match.visitDate.$lte = options.endDate;
	}

	if (options.pageSlug) match.pageSlug = options.pageSlug;
	if (options.country) match.locationCountry = options.country;

	return this.aggregate([
		{ $match: match },
		{
			$group: {
				_id: null,
				totalViews: { $sum: 1 },
				uniqueVisitors: { $sum: { $cond: ['$isUniqueVisitor', 1, 0] } },
				returningVisitors: { $sum: { $cond: ['$isReturnVisitor', 1, 0] } },
				avgTimeOnPage: { $avg: '$timeOnPage' },
				avgScrollDepth: { $avg: '$interactionScrollDepth' },
				totalClicks: { $sum: '$interactionClicks' },
				botTraffic: { $sum: { $cond: ['$isBot', 1, 0] } },
			},
		},
	]);
};

// Static method to get top pages
schema.statics.getTopPages = async function (limit = 10, startDate?: Date, endDate?: Date) {
	const match: any = {};
	if (startDate || endDate) {
		match.visitDate = {};
		if (startDate) match.visitDate.$gte = startDate;
		if (endDate) match.visitDate.$lte = endDate;
	}

	return this.aggregate([
		{ $match: match },
		{
			$group: {
				_id: '$pageSlug',
				views: { $sum: 1 },
				uniqueVisitors: { $sum: { $cond: ['$isUniqueVisitor', 1, 0] } },
				avgTimeOnPage: { $avg: '$timeOnPage' },
			},
		},
		{ $sort: { views: -1 } },
		{ $limit: limit },
	]);
};

// Static method to get traffic sources
schema.statics.getTrafficSources = async function (limit = 10, startDate?: Date, endDate?: Date) {
	const match: any = { referrerDomain: { $ne: '' } };
	if (startDate || endDate) {
		match.visitDate = {};
		if (startDate) match.visitDate.$gte = startDate;
		if (endDate) match.visitDate.$lte = endDate;
	}

	return this.aggregate([
		{ $match: match },
		{
			$group: {
				_id: '$referrerDomain',
				views: { $sum: 1 },
				uniqueVisitors: { $sum: { $cond: ['$isUniqueVisitor', 1, 0] } },
			},
		},
		{ $sort: { views: -1 } },
		{ $limit: limit },
	]);
};

// Static method to get geographic data
schema.statics.getGeographicData = async function (startDate?: Date, endDate?: Date) {
	const match: any = {};
	if (startDate || endDate) {
		match.visitDate = {};
		if (startDate) match.visitDate.$gte = startDate;
		if (endDate) match.visitDate.$lte = endDate;
	}

	return this.aggregate([
		{ $match: match },
		{
			$group: {
				_id: {
					country: '$locationCountry',
					countryCode: '$locationCountryCode',
				},
				views: { $sum: 1 },
				uniqueVisitors: { $sum: { $cond: ['$isUniqueVisitor', 1, 0] } },
			},
		},
		{ $sort: { views: -1 } },
	]);
};

const View = mongoose.model<ViewType>('View', schema);
export default View;
