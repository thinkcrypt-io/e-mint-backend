import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		unique: true,
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
	shortName: {
		title: 'Short name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {},
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
	accessLevel: {
		title: 'Access level',
		type: 'number',
		sort: false,
		edit: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	tooltip: {
		title: 'Tooltip',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	icon: {
		title: 'Icon',
		type: 'uri',
		edit: true,
		schema: {
			type: 'image',
		},
	},
	isActive: {
		title: 'Is active',
		type: 'boolean',
		sort: true,
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
			displayValue: {
				true: 'Active',
				false: 'Disabled',
			},
		},
	},
	notes: {
		title: 'Notes',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		edit: true,
		schema: {
			type: 'date-only',
			tableType: 'string',
		},
	},
};

export default settings;
