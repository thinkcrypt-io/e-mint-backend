import { SettingsType } from '../../lib/types/settings.types.js';
import Type from './client.types.js';

const statusOptions = [
	{
		label: 'Active',
		value: 'active',
	},
	{
		label: 'Inactive',
		value: 'inactive',
	},
	{
		label: 'Pending',
		value: 'pending',
	},
];

const settings: SettingsType<Type> = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
		schema: {
			default: true,
			displayInTable: true,
			sort: true,
		},
	},

	email: {
		search: true,
		sort: true,
		title: 'Email',
		type: 'email',
		schema: {
			default: true,
			displayInTable: true,
			type: 'string',
			sort: true,
			copy: true,
		},
	},
	phone: {
		search: true,
		edit: true,
		title: 'Phone',
		type: 'string',
		schema: {
			default: true,
			displayInTable: true,
		},
	},
	address: {
		edit: true,
		title: 'Address',
		type: 'string',
		search: true,
		schema: {
			type: 'textarea',
		},
	},
	city: {
		edit: true,
		title: 'City',
		type: 'string',
		search: true,
		sort: true,
		filter: {
			name: 'city',
			field: 'city_in',
			type: 'multi-select',
			label: 'City',
			title: 'Sort by city',
			category: 'distinct',
			key: 'city',
		},
		schema: {
			displayInTable: true,
			sort: true,
		},
	},
	country: {
		edit: true,
		title: 'Country',
		type: 'string',
		schema: {
			displayInTable: true,
			sort: true,
		},
	},
	website: {
		edit: true,
		title: 'Business Address',
		type: 'uri',
		search: true,
		schema: {
			displayInTable: true,
			sort: true,
			type: 'string',
			viewType: 'external-link',
		},
	},

	industry: {
		edit: true,
		title: 'Industry',
		type: 'string',

		schema: {
			displayInTable: true,
			sort: true,
		},
	},

	contactPerson: {
		edit: true,
		title: 'Contact person',
		type: 'string',
		search: true,

		schema: {
			displayInTable: true,
		},
	},

	notes: {
		search: true,
		edit: true,
		title: 'Notes',
		type: 'array-string',
		sort: true,
		schema: {
			type: 'tag',
		},
	},

	status: {
		edit: true,
		title: 'Status',
		type: 'string',
		search: true,
		sort: true,
		schema: {
			type: 'select',
			options: statusOptions,
			isRequired: true,
			sort: true,
		},
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Sort by status',
			category: 'distinct',
			key: 'status',
		},
	},

	createdAt: {
		title: 'Created At',
		type: 'string',
		schema: {
			type: 'date',
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		schema: {
			type: 'textarea',
		},
	},
};

export default settings;
