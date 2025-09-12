import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
		search: true,
		unique: true,
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
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {},
	},
	model: {
		title: 'Model',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
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
			tableType: 'date-only',
		},
	},
};

export default settings;
