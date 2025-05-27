import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	image: {
		title: 'Image',
		type: 'uri',
		edit: true,
		required: true,
		schema: {
			type: 'image',
		},
	},
	name: {
		title: 'Name',
		type: 'string',
		search: true,
		edit: true,
		sort: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	isVideoEnabled: {
		title: 'Video Thumbnail',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'isVideoEnabled',
			type: 'boolean',
			label: 'Show Video Instead of Image',
			title: 'Filter by Show Video Instead of Image',
		},
		schema: {
			sort: true,
			default: true,
		},
	},
	videoURL: {
		title: 'Video URL',
		type: 'string',
		edit: true,
		schema: {
			type: 'video',
		},
	},
	category: {
		title: 'Category',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		sort: true,
		trim: true,
		filter: {
			name: 'category',
			field: 'category_in',
			type: 'multi-select',
			label: 'Category',
			title: 'Filter by Category',
			category: 'distinct',
			key: 'category',
		},
		schema: {
			default: true,
			sort: true,
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{ label: 'Draft', value: 'draft' },
				{ label: 'Published', value: 'published' },
				{ label: 'Archived', value: 'archived' },
			],
		},
		schema: {
			type: 'select',
			default: true,
			sort: true,
			options: [
				{ label: 'Draft', value: 'draft' },
				{ label: 'Published', value: 'published' },
				{ label: 'Archived', value: 'archived' },
			],
		},
	},
	liveUrl: {
		title: 'Live Url',
		type: 'uri',
		edit: true,
		required: true,
		schema: {
			type: 'string',
			tableType: 'external-link',
			copy: true,
			viewType: 'external-link',
		},
	},
	priority: {
		title: 'Priority',
		type: 'number',
		sort: false,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	isFeatured: {
		title: 'Is featured',
		type: 'boolean',
		sort: true,
		edit: true,

		filter: {
			name: 'isFeatured',
			type: 'boolean',
			label: 'Is featured',
			title: 'Filter by Is featured',
		},
		schema: {},
	},
	images: {
		title: 'Images',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'image-array',
		},
	},
	client: {
		title: 'Client',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	shortDescription: {
		title: 'Short description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	logo: {
		title: 'Logo',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'image',
		},
	},
	coverImage: {
		title: 'Cover image',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: {
			type: 'image',
		},
	},
	title: {
		title: 'Title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {},
	},
	overview: {
		title: 'Overview',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	subTitle: {
		title: 'Sub Title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {},
	},
	longDescription: {
		title: 'Long Description',
		type: 'string',
		edit: true,
		schema: {
			type: 'textarea',
		},
	},
	tags: {
		title: 'Tags',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'tag',
		},
	},
	challengeTitle: {
		title: 'Challenge Title',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	challengeDescription: {
		title: 'Challenge Description',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	productTitle: {
		title: 'Product Title',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	productDescription: {
		title: 'Product Description',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	companyName: {
		title: 'Company Name',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	companyTitle: {
		title: 'Company Section Title',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	companyDescription: {
		title: 'Company description',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	companyCategory: {
		title: 'Company Category',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	companyUrl: {
		title: 'Company Url',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	approachTitle: {
		title: 'Approach Title',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	approachDescription: {
		title: 'Approach Description',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	solutionTitle: {
		title: 'Solution Title',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	solutionDescription: {
		title: 'Solution Description',
		type: 'string',
		edit: true,
		schema: {
			type: 'textarea',
		},
	},
	solutionFeatures: {
		title: 'Solution Features',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'custom-section-array',
		},
	},
	showCaseStudy: {
		title: 'Show Case Study',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'showCaseStudy',
			type: 'boolean',
			label: 'Show case study',
			title: 'Filter by Show case study',
		},
		schema: {
			sort: true,
			default: true,
		},
	},
	showLiveUrl: {
		title: 'Show live url',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'showLiveUrl',
			type: 'boolean',
			label: 'Show live url',
			title: 'Filter by Show live url',
		},
		schema: {
			sort: true,
			defailt: true,
		},
	},
	techStackTitle: {
		title: 'Section Title',
		type: 'string',

		edit: true,
		schema: {},
	},
	techStackDescription: {
		title: 'Section Description',
		type: 'string',

		edit: true,
		schema: {
			type: 'textarea',
		},
	},
	techStack: {
		title: 'Tech Stack',
		type: 'array',
		edit: true,
		schema: {
			type: 'tag',
		},
	},
	review: {
		title: 'Review',
		type: 'string',

		edit: true,
		schema: {
			type: 'textarea',
		},
	},
	duration: {
		title: 'Duration Of Project',
		type: 'string',
		edit: true,
		schema: {},
	},
	year: {
		title: 'Year Developed',
		type: 'string',
		edit: true,
		schema: {},
	},
	createdAt: {
		title: 'Created at',
		type: 'string',
		schema: { type: 'date', tableType: 'string' },
	},
};

export default settings;
