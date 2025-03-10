import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	icon: {
		title: 'Icon',
		type: 'uri',
		search: true,
		edit: true,
		required: true,
		schema: {
			type: 'image',
		},
	},
	name: {
		title: 'Client Name',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
			type: 'text',
			tableType: 'image-text',
			imageKey: 'icon',
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		search: true,
		edit: true,
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
			default: true,
			sort: true,
		},
	},
	isActive: {
		title: 'Show in list',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: { name: 'isActive', type: 'boolean', label: 'Show/Hide', title: 'Show in client list' },
		schema: {
			sort: true,
			default: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		schema: { type: 'date', tableType: 'date-only' },
	},
};

export default settings;
