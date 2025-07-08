import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		search: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	page: {
		title: 'Page',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	title: {
		title: 'Title',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	keywords: {
		title: 'Keywords',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'tag',
		},
	},
	slug: {
		title: 'Slug',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
			type: 'slug',
		},
	},
	canonicalUrl: {
		title: 'Canonical url',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
			helperText:
				'Canonical URL is used to specify the preferred version of a web page when there are multiple versions with similar content. It helps search engines understand which version to index and display in search results.',
		},
	},
	ogTitle: {
		title: 'Og title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			helperText:
				'Open Graph title is used to define the title of a web page when shared on social media platforms like Facebook, LinkedIn, etc. It helps in providing a clear and concise title for the shared content.',
		},
	},
	ogDescription: {
		title: 'Og description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
			helperText:
				'max 160 characters. Open Graph description is used to define the description of a web page when shared on social media platforms like Facebook, LinkedIn, etc. It helps in providing a clear and concise description for the shared content.',
		},
	},
	ogImage: {
		title: 'Og image',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'image',
		},
	},
	ogType: {
		title: 'Og type',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'ogType',
			field: 'ogType_in',
			type: 'multi-select',
			label: 'OgType',
			title: 'Filter by OgType',
			options: [
				{
					label: 'Website',
					value: 'website',
				},
				{
					label: 'Article',
					value: 'article',
				},
			],
		},
		schema: {
			helperText:
				'Open Graph type is used to define the type of content being shared on social media platforms. It helps in categorizing the content and providing context to the shared link.',
			type: 'select',
			options: [
				{
					label: 'Website',
					value: 'website',
				},
				{
					label: 'Article',
					value: 'article',
				},
			],
		},
	},
	twitterTitle: {
		title: 'Twitter title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			helperText:
				'max 70 characters. Twitter title is used to define the title of a web page when shared on Twitter. It helps in providing a clear and concise title for the shared content.',
		},
	},
	twitterDescription: {
		title: 'Twitter description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
			helperText:
				'max 200 characters. Twitter description is used to define the description of a web page when shared on Twitter. It helps in providing a clear and concise description for the shared content.',
		},
	},
	twitterImage: {
		title: 'Twitter image',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'image',
		},
	},
	twitterCard: {
		title: 'Twitter card',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'twitterCard',
			field: 'twitterCard_in',
			type: 'multi-select',
			label: 'TwitterCard',
			title: 'Filter by TwitterCard',
			options: [
				{
					label: 'Summary',
					value: 'summary',
				},
				{
					label: 'Summary_large_image',
					value: 'summary_large_image',
				},
			],
		},
		schema: {
			helperText:
				'Twitter card is used to define the type of content being shared on Twitter. It helps in categorizing the content and providing context to the shared link.',
			type: 'select',
			options: [
				{
					label: 'Summary',
					value: 'summary',
				},
				{
					label: 'Summary_large_image',
					value: 'summary_large_image',
				},
			],
		},
	},
	isActive: {
		title: 'Is active',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Is active',
			title: 'Filter by Is active',
		},
		schema: {
			default: true,
			sort: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Created at',
			title: 'Filter by Created at',
		},
		schema: {
			type: 'date',
			tableType: 'string',
		},
	},
};

export default settings;
