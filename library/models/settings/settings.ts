import { SettingsType } from '../../types/_index.js';

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
		title: 'Settings Fields',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'settings',
		},
	},

	sch: {
		title: 'Schema',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		unique: true,
		required: true,
		schema: {
			type: 'data-menu',
			tableType: 'string',
			model: 'mongoose/list',
			dataKey: 'name',
		},
	},
	isDisabled: {
		title: 'Disable Configuration',
		type: 'boolean',
		edit: true,
		schema: {
			sort: true,
			default: true,
			displayValue: {
				true: 'Yes',
				false: 'No',
			},
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
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
	updatedAt: {
		title: 'Updated At',
		type: 'date',
		sort: true,
		edit: true,
		schema: {
			type: 'date',
			tableType: 'date-only',
		},
	},
};

export default settings;
