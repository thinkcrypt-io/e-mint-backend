import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		search: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
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
	url: {
		title: 'Url',
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
	provider: {
		title: 'Provider',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		filter: {
			name: 'provider',
			type: 'multi-select',
			label: 'Provider',
			title: 'Filter by Provider',
			category: 'distinct',
			key: 'provider',
		},
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	providerUrl: {
		title: 'Provider URL',
		type: 'string',
		sort: false,
		search: false,
		edit: true,
		required: false,
		trim: true,
		schema: {},
	},
	note: {
		title: 'Note',
		type: 'string',

		edit: true,

		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	accountId: {
		title: 'Account Id',
		type: 'string',
		sort: false,
		search: false,
		edit: true,
		required: false,
		trim: true,
		schema: {},
	},
	purchaseDate: {
		title: 'Purchase date',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		required: true,
		filter: {
			name: 'purchaseDate',
			type: 'date',
			label: 'Purchase date',
			title: 'Filter by Purchase date',
		},
		schema: {
			type: 'date',
			tableType: 'date-only',
			default: true,
			sort: true,
		},
	},
	expiryDate: {
		title: 'Expiry date',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		required: true,
		filter: {
			name: 'expiryDate',
			type: 'date',
			label: 'Expiry date',
			title: 'Filter by Expiry date',
		},
		schema: {
			type: 'date',
			tableType: 'date-only',
			default: true,
			sort: true,
		},
	},
	renewalDate: {
		title: 'Renewal date',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		required: true,
		filter: {
			name: 'renewalDate',
			type: 'date',
			label: 'Renewal date',
			title: 'Filter by Renewal date',
		},
		schema: {
			type: 'date',
			tableType: 'date-only',
			default: true,
			sort: true,
		},
	},
	renewalPrice: {
		title: 'Renewal price',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	purchasePrice: {
		title: 'Purchase Price',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	autoRenew: {
		title: 'Auto renew',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'autoRenew',
			type: 'boolean',
			label: 'Auto renew',
			title: 'Filter by Auto renew',
		},
		schema: {
			default: true,
			sort: true,
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{
					label: 'Active',
					value: 'active',
				},
				{
					label: 'Inactive',
					value: 'inactive',
				},
				{
					label: 'Grace',
					value: 'grace',
				},
				{
					label: 'Expired',
					value: 'expired',
				},
			],
		},
		schema: {
			default: true,
			sort: true,
			type: 'select',
			options: [
				{
					label: 'Active',
					value: 'active',
				},
				{
					label: 'Inactive',
					value: 'inactive',
				},
				{
					label: 'Grace',
					value: 'grace',
				},
				{
					label: 'Expired',
					value: 'expired',
				},
			],
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
