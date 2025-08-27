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
			default: true,
			sort: true,
		},
	},
	route: {
		title: 'Route',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	isActive: {
		title: 'Status',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		required: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Status',
			title: 'Filter by Status',
		},
		schema: {
			sort: true,
			default: true,
			type: 'select',
			options: [
				{
					label: 'Active',
					value: true,
				},
				{
					label: 'Inactive',
					value: false,
				},
			],
			tableType: 'checkbox',

			displayValue: {
				true: 'Active',
				false: 'Inactive',
			},
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
			type: 'editor',
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		search: false,
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
