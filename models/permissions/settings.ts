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
		title: 'Options.create',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

		schema: {
			default: true,
			sort: true,
		},
	},
	'options.view': {
		title: 'Options.view',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

		schema: {
			default: true,
			sort: true,
		},
	},
	'options.edit': {
		title: 'Options.edit',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

		schema: {
			default: true,
			sort: true,
		},
	},
	'options.delete': {
		title: 'Options.delete',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

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
			type: 'date-only',
			tableType: 'string',
		},
	},
};

export default settings;
