import { SettingsType } from '../../imports.js';
import Author from '../../models/author/model.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Blog Title',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	excerpt: {
		title: 'Short Description',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			type: 'textaera',
		},
	},
	content: {
		title: 'Content',
		type: 'string',
		edit: true,
		schema: {
			type: 'editor',
		},
	},
	author: {
		title: 'Author',
		type: 'string',
		sort: true,

		edit: true,
		required: true,
		populate: {
			path: 'author',
			select: 'name',
		},
		filter: {
			name: 'author',
			field: 'author_in',
			type: 'multi-select',
			category: 'model',
			model: Author,
			key: 'name',
			label: 'Author',
			title: 'Filter by Author',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'author.name',
			model: 'authors',
			default: true,
			sort: true,
		},
	},
	publishedAt: {
		title: 'Published At',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'publishedAt',
			type: 'date',
			label: 'Published at',
			title: 'Filter by Published at',
		},
		schema: {
			type: 'date',
			tableType: 'string',
			default: true,
			sort: true,
		},
	},
	readTime: {
		title: 'Read Time',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	tags: {
		title: 'Tags',
		type: 'array',
		edit: true,
		required: true,
		schema: {
			type: 'tag',
		},
	},
	image: {
		title: 'Featured Image',
		type: 'uri',
		edit: true,
		required: true,
		schema: {
			type: 'image',
		},
	},
	coverImage: {
		title: 'Cover Image',
		type: 'uri',
		edit: true,
		schema: {
			type: 'image',
		},
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
	slug: {
		title: 'Slug',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'slug',
			helperText: 'This will be auto-generated based on the blog title.',
			default: true,
			sort: true,
		},
	},
	views: {
		title: 'Views',
		type: 'number',
		edit: true,
		schema: {
			sort: true,
		},
	},
	likes: {
		title: 'Likes',
		type: 'number',
		edit: true,
		schema: {
			sort: true,
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{
					label: 'Published',
					value: 'published',
				},
				{
					label: 'Draft',
					value: 'draft',
				},
				{
					label: 'Archived',
					value: 'archived',
				},
			],
		},
		schema: {
			type: 'select',
			default: true,
			sort: true,
			options: [
				{
					label: 'Published',
					value: 'published',
				},
				{
					label: 'Draft',
					value: 'draft',
				},
				{
					label: 'Archived',
					value: 'archived',
				},
			],
		},
	},
	isFeatured: {
		title: 'Is Featured',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'isFeatured',
			type: 'boolean',
			label: 'Is featured',
			title: 'Filter by Is featured',
		},
		schema: {
			default: true,
			sort: true,
		},
	},
	metaTitle: {
		title: 'Meta title',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	metaDescription: {
		title: 'Meta description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	metaKeywords: {
		title: 'Meta keywords',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'tag',
		},
	},
	category: {
		title: 'Category',
		type: 'string',

		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	code: {
		title: 'Code',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	allowComments: {
		title: 'Allow comments',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'allowComments',
			type: 'boolean',
			label: 'Allow comments',
			title: 'Filter by Allow comments',
		},
		schema: {},
	},
	seoScore: {
		title: 'Seo score',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		min: 0,
		max: 100,
		schema: {},
	},
	contentScore: {
		title: 'Content score',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		min: 0,
		max: 100,
		schema: {},
	},
	scheduledAt: {
		title: 'Scheduled at',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'scheduledAt',
			type: 'date',
			label: 'Scheduled at',
			title: 'Filter by Scheduled at',
		},
		schema: {
			type: 'date',
			tableType: 'string',
		},
	},
	isDeleted: {
		title: 'Is deleted',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'isDeleted',
			type: 'boolean',
			label: 'Is deleted',
			title: 'Filter by Is deleted',
		},
		schema: {},
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
