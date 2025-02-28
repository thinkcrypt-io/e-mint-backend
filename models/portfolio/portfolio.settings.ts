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
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
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
		required: true,
		filter: {
			name: 'isFeatured',
			type: 'boolean',
			label: 'Is featured',
			title: 'Filter by Is featured',
		},
		schema: {},
	},
	createdAt: {
		title: 'Created at',
		type: 'string',
		schema: { type: 'date', tableType: 'string' },
	},
};

export default settings;
