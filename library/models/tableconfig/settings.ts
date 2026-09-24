import { SettingsType } from '../../types/_index.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
		search: true,
		// Not unique: `path` is the key, and two routes can share a page title.
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
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
	path: {
		title: 'Path',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		unique: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	fields: {
		title: 'Fields',
		type: 'array-string',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'model-fields',
		},
	},
	model: {
		title: 'Model',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		populate: {
			path: 'model',
			select: 'name modelName route',
		},

		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'model.modelName',
			model: 'models',
		},
	},
	showExport: {
		title: 'Export button',
		type: 'boolean',
		edit: true,
		schema: {
			tableType: 'boolean',
		},
	},
	showAddButton: {
		title: 'Add button',
		type: 'boolean',
		edit: true,
		schema: {
			tableType: 'boolean',
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
			tableType: 'date-only',
		},
	},
};

export default settings;
