import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		edit: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
		schema: {
			default: true,
			isRequired: true,
			sort: true,
		},
	},

	description: {
		title: 'Description',
		type: 'text',
		edit: true,
		schema: {
			type: 'textarea',
		},
	},
	logo: {
		title: 'Logo',
		type: 'uri',
		edit: true,
		schema: {
			type: 'image',
		},
	},
	isActive: {
		edit: true,
		title: 'Is Active',
		type: 'boolean',
		sort: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by active status',
		},
		schema: {
			type: 'boolean',

			default: true,
			sort: true,
		},
	},

	createdAt: {
		type: 'date',
		title: 'Created At',
		schema: {
			type: 'date',
			tableType: 'date-only',
			default: true,
			sort: true,
		},
	},
	permissions: {
		edit: true,
		title: 'Permissions',
		type: 'array',
		schema: {
			type: 'permissions',
		},
	},
};

export default settings;
