import { SettingsType } from '../../types/_index.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
		},
	},
	route: {
		title: 'Route',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		unique: true,
		trim: true,
		schema: {
			default: true,
			copy: true,
		},
	},
	model: {
		title: 'Model',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	filters: {
		title: 'Filters',
		type: 'array-object',
		edit: true,
		schema: {
			tableType: 'data-array-count',
			default: true,
		},
	},
	// Written by the model's pre-save hook, never by a request — so not `edit`.
	filterLabels: {
		title: 'Filter chips',
		type: 'array-string',
		schema: {
			type: 'tag',
			default: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		schema: {
			type: 'date',
			tableType: 'date-only',
		},
	},
	updatedAt: {
		title: 'Updated at',
		type: 'date',
		sort: true,
		schema: {
			type: 'date',
			tableType: 'date-only',
			default: true,
		},
	},
};

export default settings;
