import { SettingsType } from '../../lib/types/settings.types.js';
import { ViewType } from './model.js';

export const viewSettings: SettingsType<ViewType> = {
	pageSlug: {
		title: 'Page Slug',
		type: 'string',
		search: true,
		sort: true,
		edit: true,
		required: true,
		trim: true,
		// filter: {
		// 	name: 'pageSlug',
		// 	field: 'pageSlug_in',
		// 	type: 'multi-select',
		// 	label: 'Page',
		// 	title: 'Filter by Page',
		// 	category: 'distinct',
		// 	key: 'pageSlug',
		// },
		schema: {
			default: true,
			sort: true,
		},
	},
	pageTitle: {
		title: 'Page Title',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	pageUrl: {
		title: 'Page URL',
		type: 'string',
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	ipAddress: {
		title: 'IP Address',
		type: 'string',
		search: true,
		sort: true,
		edit: true,

		trim: true,
		// filter: {
		// 	name: 'ipAddress',
		// 	field: 'ipAddress_in',
		// 	type: 'multi-select',
		// 	label: 'IP Address',
		// 	title: 'Filter by IP',
		// 	category: 'distinct',
		// 	key: 'ipAddress',
		// },
		schema: {
			sort: true,
		},
	},
	userAgent: {
		title: 'User Agent',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	fingerprint: {
		title: 'Fingerprint',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	sessionId: {
		title: 'Session ID',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	// Device Information (flattened)
	deviceType: {
		title: 'Device Type',
		type: 'string',
		sort: true,
		edit: true,

		// enum: ['desktop', 'tablet', 'mobile', 'unknown'],
		filter: {
			name: 'deviceType',
			field: 'deviceType_in',
			type: 'multi-select',
			label: 'Device Type',
			title: 'Filter by Device Type',
			category: 'distinct',
			key: 'deviceType',
		},
		schema: {
			sort: true,
		},
	},
	deviceBrand: {
		title: 'Device Brand',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'deviceBrand',
		// 	field: 'deviceBrand_in',
		// 	type: 'multi-select',
		// 	label: 'Device Brand',
		// 	title: 'Filter by Device Brand',
		// 	category: 'distinct',
		// 	key: 'deviceBrand',
		// },
		schema: {
			sort: true,
		},
	},
	deviceModel: {
		title: 'Device Model',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	deviceOs: {
		title: 'Operating System',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'deviceOs',
		// 	field: 'deviceOs_in',
		// 	type: 'multi-select',
		// 	label: 'Operating System',
		// 	title: 'Filter by OS',
		// 	category: 'distinct',
		// 	key: 'deviceOs',
		// },
		schema: {
			sort: true,
		},
	},
	deviceOsVersion: {
		title: 'OS Version',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	deviceBrowser: {
		title: 'Browser',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'deviceBrowser',
		// 	field: 'deviceBrowser_in',
		// 	type: 'multi-select',
		// 	label: 'Browser',
		// 	title: 'Filter by Browser',
		// 	category: 'distinct',
		// 	key: 'deviceBrowser',
		// },
		schema: {
			sort: true,
		},
	},
	deviceBrowserVersion: {
		title: 'Browser Version',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	deviceScreenResolution: {
		title: 'Screen Resolution',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	deviceViewportWidth: {
		title: 'Viewport Width',
		type: 'number',
		sort: true,
		edit: true,
		min: 0,
		schema: {
			sort: true,
		},
	},
	deviceViewportHeight: {
		title: 'Viewport Height',
		type: 'number',
		sort: true,
		edit: true,
		min: 0,
		schema: {
			sort: true,
		},
	},

	// Location Information (flattened)
	locationCountry: {
		title: 'Country',
		type: 'string',
		search: true,
		sort: true,
		edit: true,
		trim: true,
		filter: {
			name: 'locationCountry',
			field: 'locationCountry_in',
			type: 'multi-select',
			label: 'Country',
			title: 'Filter by Country',
			category: 'distinct',
			key: 'locationCountry',
		},
		schema: {
			sort: true,
		},
	},
	locationCountryCode: {
		title: 'Country Code',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	locationRegion: {
		title: 'Region',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		filter: {
			name: 'locationRegion',
			field: 'locationRegion_in',
			type: 'multi-select',
			label: 'Region',
			title: 'Filter by Region',
			category: 'distinct',
			key: 'locationRegion',
		},
		schema: {
			sort: true,
		},
	},
	locationRegionCode: {
		title: 'Region Code',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	locationCity: {
		title: 'City',
		type: 'string',
		search: true,
		sort: true,
		edit: true,
		trim: true,
		filter: {
			name: 'locationCity',
			field: 'locationCity_in',
			type: 'multi-select',
			label: 'City',
			title: 'Filter by City',
			category: 'distinct',
			key: 'locationCity',
		},
		schema: {
			sort: true,
		},
	},
	locationTimezone: {
		title: 'Timezone',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	locationLatitude: {
		title: 'Latitude',
		type: 'number',
		sort: true,
		edit: true,

		schema: {
			sort: true,
			type: 'string',
		},
	},
	locationLongitude: {
		title: 'Longitude',
		type: 'number',
		sort: true,
		edit: true,

		schema: {
			sort: true,
			type: 'string',
		},
	},
	locationIsp: {
		title: 'ISP',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'locationIsp',
		// 	field: 'locationIsp_in',
		// 	type: 'multi-select',
		// 	label: 'ISP',
		// 	title: 'Filter by ISP',
		// 	category: 'distinct',
		// 	key: 'locationIsp',
		// },
		schema: {
			sort: true,
		},
	},
	locationOrganization: {
		title: 'Organization',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	locationProxy: {
		title: 'Proxy',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'locationProxy',
		// 	field: 'locationProxy',
		// 	type: 'boolean',
		// 	label: 'Proxy',
		// 	title: 'Filter by Proxy',
		// },
		schema: {
			sort: true,
		},
	},
	locationVpn: {
		title: 'VPN',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'locationVpn',
		// 	field: 'locationVpn',
		// 	type: 'boolean',
		// 	label: 'VPN',
		// 	title: 'Filter by VPN',
		// },
		schema: {
			sort: true,
		},
	},
	locationTor: {
		title: 'Tor',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'locationTor',
		// 	field: 'locationTor',
		// 	type: 'boolean',
		// 	label: 'Tor',
		// 	title: 'Filter by Tor',
		// },
		schema: {
			sort: true,
		},
	},
	referrer: {
		title: 'Referrer',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	customRef: {
		title: 'Source',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	referrerDomain: {
		title: 'Referrer Domain',
		type: 'string',
		search: true,
		sort: true,
		edit: true,
		trim: true,
		filter: {
			name: 'referrerDomain',
			field: 'referrerDomain_in',
			type: 'multi-select',
			label: 'Referrer Domain',
			title: 'Filter by Referrer',
			category: 'distinct',
			key: 'referrerDomain',
		},
		schema: {
			sort: true,
		},
	},
	utmSource: {
		title: 'Traffic Source',
		type: 'string',
		search: true,
		sort: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'utmSource',
		// 	field: 'utmSource_in',
		// 	type: 'multi-select',
		// 	label: 'UTM Source',
		// 	title: 'Filter by UTM Source',
		// 	category: 'distinct',
		// 	key: 'utmSource',
		// },
		schema: {
			sort: true,
		},
	},
	utmMedium: {
		title: 'UTM Medium',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'utmMedium',
		// 	field: 'utmMedium_in',
		// 	type: 'multi-select',
		// 	label: 'UTM Medium',
		// 	title: 'Filter by UTM Medium',
		// 	category: 'distinct',
		// 	key: 'utmMedium',
		// },
		schema: {
			sort: true,
		},
	},
	utmCampaign: {
		title: 'UTM Campaign',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'utmCampaign',
		// 	field: 'utmCampaign_in',
		// 	type: 'multi-select',
		// 	label: 'UTM Campaign',
		// 	title: 'Filter by UTM Campaign',
		// 	category: 'distinct',
		// 	key: 'utmCampaign',
		// },
		schema: {
			sort: true,
		},
	},
	utmTerm: {
		title: 'UTM Term',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	utmContent: {
		title: 'UTM Content',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	isUniqueVisitor: {
		title: 'Unique Visitor',
		type: 'boolean',
		sort: true,
		edit: true,

		filter: {
			name: 'isUniqueVisitor',
			field: 'isUniqueVisitor',
			type: 'boolean',
			label: 'Unique Visitor',
			title: 'Filter by Unique Visitors',
		},
		schema: {
			sort: true,
		},
	},
	isReturnVisitor: {
		title: 'Return Visitor',
		type: 'boolean',
		sort: true,
		edit: true,

		filter: {
			name: 'isReturnVisitor',
			field: 'isReturnVisitor',
			type: 'boolean',
			label: 'Return Visitor',
			title: 'Filter by Return Visitors',
		},
		schema: {
			sort: true,
		},
	},
	visitCount: {
		title: 'Visit Count',
		type: 'number',
		sort: true,
		edit: true,

		schema: {
			default: true,
			sort: true,
		},
	},
	previousVisitDate: {
		title: 'Previous Visit Date',
		type: 'date',
		sort: true,
		edit: true,
		schema: {
			sort: true,
		},
	},
	sessionDuration: {
		title: 'Session Duration (seconds)',
		type: 'number',
		sort: true,
		edit: true,
		min: 0,
		schema: {
			sort: true,
		},
	},
	timeOnPage: {
		title: 'Time on Page (seconds)',
		type: 'number',
		sort: true,
		edit: true,
		min: 0,
		schema: {
			sort: true,
		},
	},
	bounceRate: {
		title: 'Bounce Rate',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'bounceRate',
		// 	field: 'bounceRate',
		// 	type: 'boolean',
		// 	label: 'Bounce Rate',
		// 	title: 'Filter by Bounce Rate',
		// },
		schema: {
			sort: true,
		},
	},
	exitPage: {
		title: 'Exit Page',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'exitPage',
		// 	field: 'exitPage',
		// 	type: 'boolean',
		// 	label: 'Exit Page',
		// 	title: 'Filter by Exit Page',
		// },
		schema: {
			sort: true,
		},
	},
	pagesPerSession: {
		title: 'Pages per Session',
		type: 'number',
		sort: true,
		edit: true,
		min: 1,
		schema: {
			sort: true,
		},
	},
	// interactions: {
	// 	title: 'Interactions',
	// 	type: 'object',
	// 	edit: true,
	// 	schema: {
	// 		type: 'object',
	// 		properties: {
	// 			clicks: {
	// 				type: 'number',
	// 				title: 'Clicks',
	// 				minimum: 0,
	// 			},
	// 			scrollDepth: {
	// 				type: 'number',
	// 				title: 'Scroll Depth (%)',
	// 				minimum: 0,
	// 				maximum: 100,
	// 			},
	// 			downloads: {
	// 				type: 'number',
	// 				title: 'Downloads',
	// 				minimum: 0,
	// 			},
	// 			formSubmissions: {
	// 				type: 'number',
	// 				title: 'Form Submissions',
	// 				minimum: 0,
	// 			},
	// 		},
	// 	},
	// },
	language: {
		title: 'Language',
		type: 'string',
		search: true,
		sort: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'language',
		// 	field: 'language_in',
		// 	type: 'multi-select',
		// 	label: 'Language',
		// 	title: 'Filter by Language',
		// 	category: 'distinct',
		// 	key: 'language',
		// },
		schema: {
			sort: true,
		},
	},
	acceptLanguage: {
		title: 'Accept Language',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	encoding: {
		title: 'Encoding',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	colorDepth: {
		title: 'Color Depth',
		type: 'number',
		sort: true,
		edit: true,
		min: 1,
		schema: {
			sort: true,
		},
	},
	pixelRatio: {
		title: 'Pixel Ratio',
		type: 'number',
		sort: true,
		edit: true,
		min: 0,
		schema: {
			sort: true,
		},
	},
	touchSupport: {
		title: 'Touch Support',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'touchSupport',
		// 	field: 'touchSupport',
		// 	type: 'boolean',
		// 	label: 'Touch Support',
		// 	title: 'Filter by Touch Support',
		// },
		schema: {
			sort: true,
		},
	},
	cookieEnabled: {
		title: 'Cookie Enabled',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'cookieEnabled',
		// 	field: 'cookieEnabled',
		// 	type: 'boolean',
		// 	label: 'Cookie Enabled',
		// 	title: 'Filter by Cookie Support',
		// },
		schema: {
			sort: true,
		},
	},
	javaEnabled: {
		title: 'Java Enabled',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'javaEnabled',
		// 	field: 'javaEnabled',
		// 	type: 'boolean',
		// 	label: 'Java Enabled',
		// 	title: 'Filter by Java Support',
		// },
		schema: {
			sort: true,
		},
	},
	isBot: {
		title: 'Bot Traffic',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'isBot',
			field: 'isBot',
			type: 'boolean',
			label: 'Bot Traffic',
			title: 'Filter by Bot Traffic',
		},
		schema: {
			sort: true,
		},
	},
	botName: {
		title: 'Bot Name',
		type: 'string',
		search: true,
		sort: true,
		edit: true,
		trim: true,
		// filter: {
		// 	name: 'botName',
		// 	field: 'botName_in',
		// 	type: 'multi-select',
		// 	label: 'Bot Name',
		// 	title: 'Filter by Bot Name',
		// 	category: 'distinct',
		// 	key: 'botName',
		// },
		schema: {
			sort: true,
		},
	},
	isDevelopment: {
		title: 'Development Mode',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'isDevelopment',
		// 	field: 'isDevelopment',
		// 	type: 'boolean',
		// 	label: 'Development Mode',
		// 	title: 'Filter by Development Mode',
		// },
		schema: {
			sort: true,
		},
	},
	isPreview: {
		title: 'Preview Mode',
		type: 'boolean',
		sort: true,
		edit: true,
		// filter: {
		// 	name: 'isPreview',
		// 	field: 'isPreview',
		// 	type: 'boolean',
		// 	label: 'Preview Mode',
		// 	title: 'Filter by Preview Mode',
		// },
		schema: {
			sort: true,
		},
	},
	tags: {
		title: 'Tags',
		type: 'array-string',
		search: true,
		edit: true,
		schema: {
			type: 'tag',
		},
	},
	// customAttributes: {
	// 	title: 'Custom Attributes',
	// 	type: 'array-object',
	// 	edit: true,
	// 	schema: {
	// 		type: 'array',
	// 		items: {
	// 			type: 'object',
	// 			properties: {
	// 				label: {
	// 					type: 'string',
	// 					title: 'Label',
	// 				},
	// 				value: {
	// 					type: 'string',
	// 					title: 'Value',
	// 				},
	// 			},
	// 		},
	// 	},
	// },
	visitDate: {
		title: 'Visit Date',
		type: 'date',
		sort: true,
		edit: true,

		filter: {
			name: 'visitDate',
			field: 'visitDate',
			type: 'date',
			label: 'Visit Date',
			title: 'Filter by Visit Date',
		},
		schema: {
			sort: true,
			default: true,
		},
	},
	createdAt: {
		title: 'Created At',
		type: 'date',
		sort: true,

		// filter: {
		// 	name: 'visitDate',
		// 	field: 'visitDate',
		// 	type: 'date',
		// 	label: 'Visit Date',
		// 	title: 'Filter by Visit Date',
		// },
		schema: {
			sort: true,
		},
	},
	updatedAt: {
		title: 'Updated At',
		type: 'date',
		sort: true,
		schema: {
			sort: true,
		},
	},
};

export default viewSettings;
