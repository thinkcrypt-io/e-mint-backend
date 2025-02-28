import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	icon: {
		title: 'Icon',
		type: 'uri',
		edit: true,
		schema: {
			type: 'image',
		},
	},
	name: {
		title: 'Name',
		type: 'string',
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
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	priority: {
		title: 'Priority',
		type: 'number',
		edit: true,
		required: true,
		schema: {
			sort: true,
			default: true,
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
			title: 'Filter by Active Status',
		},
		schema: {
			default: true,
			sort: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		edit: true,
		schema: { type: 'date', tableType: 'string' },
	},
};

export default settings;
