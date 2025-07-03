import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
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
		schema: {
			type: 'textarea',
		},
	},
	key: {
		title: 'Key',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			type: 'slug',
			default: true,
			sort: true,
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
	'options.create': {
		title: 'Create',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

		schema: {
			default: true,
			sort: true,
			displayValue: {
				true: 'Active',
				false: 'Disabled',
			},
		},
	},
	'options.view': {
		title: 'View',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

		schema: {
			default: true,
			sort: true,
			displayValue: {
				true: 'Active',
				false: 'Disabled',
			},
		},
	},
	'options.edit': {
		title: 'Update',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

		schema: {
			default: true,
			sort: true,
			displayValue: {
				true: 'Active',
				false: 'Disabled',
			},
		},
	},
	'options.delete': {
		title: 'Delete',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

		schema: {
			default: true,
			sort: true,
			displayValue: {
				true: 'Active',
				false: 'Disabled',
			},
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
			type: 'date-only',
			tableType: 'string',
		},
	},
};

export default settings;
