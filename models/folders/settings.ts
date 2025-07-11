import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
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
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	parent: {
		title: 'Parent',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		populate: {
			path: 'parent',
			select: 'name',
		},

		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'parent.name',
			model: 'folders',
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
			sort: true,
			default: true,
		},
	},
	priority: {
		title: 'Priority',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		schema: {
			sort: true,
			default: true,
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
			sort: true,
			default: true,
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
