import { ACCESS_CONTROL, SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		edit: false,
		search: true,
		schema: {
			sort: true,
			default: true,
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
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	plan: {
		title: 'Plan Name',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	currency: {
		title: 'Currency',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		filter: {
			name: 'currency',
			field: 'currency_in',
			type: 'multi-select',
			label: 'Currency',
			title: 'Filter by Currency',
			options: [
				{ label: 'Bdt', value: 'bdt' },
				{ label: 'Usd', value: 'usd' },
				{ label: 'Eur', value: 'eur' },
				{ label: 'Other', value: 'other' },
			],
		},
		schema: {
			type: 'select',
			default: true,
			sort: true,
			options: [
				{ label: 'BDT', value: 'bdt' },
				{ label: 'USD', value: 'usd' },
				{ label: 'EUR', value: 'eur' },
				{ label: 'Other', value: 'other' },
			],
		},
	},
	amount: {
		title: 'Amount',
		type: 'number',
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{ label: 'Active', value: 'active' },
				{ label: 'Inactive', value: 'inactive' },
				{ label: 'Expired', value: 'expired' },
				{ label: 'Cancelled', value: 'cancelled' },
			],
		},
		schema: {
			type: 'select',
			default: true,
			sort: true,
			options: [
				{ label: 'Active', value: 'active' },
				{ label: 'Inactive', value: 'inactive' },
				{ label: 'Expired', value: 'expired' },
				{ label: 'Cancelled', value: 'cancelled' },
			],
		},
	},
	billingCycle: {
		title: 'Billing cycle',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'billingCycle',
			field: 'billingCycle_in',
			type: 'multi-select',
			label: 'BillingCycle',
			title: 'Filter by BillingCycle',
			options: [
				{ label: 'Monthly', value: 'monthly' },
				{ label: 'Yearly', value: 'yearly' },
				{ label: 'Trial', value: 'trial' },
				{ label: 'Custom', value: 'custom' },
			],
		},
		schema: {
			type: 'select',
			default: true,
			sort: true,
			options: [
				{ label: 'Monthly', value: 'monthly' },
				{ label: 'Yearly', value: 'yearly' },
				{ label: 'Trial', value: 'trial' },
				{ label: 'Custom', value: 'custom' },
			],
		},
	},
	renewDate: {
		title: 'Next Renewal Date',
		type: 'date',
		sort: true,
		edit: true,
		filter: { name: 'renewDate', type: 'date', label: 'Renew date', title: 'Filter by Renew date' },
		schema: { type: 'date', tableType: 'date-only', sort: true },
	},
	lastPaymentDate: {
		title: 'Last Payment Date',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'lastPaymentDate',
			type: 'date',
			label: 'Last payment date',
			title: 'Filter by Last payment date',
		},
		schema: { type: 'date', tableType: 'date-only', sort: true },
	},
	autoRenew: {
		title: 'Auto renew',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'autoRenew',
			type: 'boolean',
			label: 'Auto renew',
			title: 'Filter by Auto renew',
		},
		schema: { sort: true },
	},
	accountLogin: {
		title: 'Account login Info',
		type: 'string',
		edit: true,
		schema: {
			type: 'textarea',
			helper: 'Enter the account login information here',
		},
	},
	...ACCESS_CONTROL.SETTINGS,

	createdAt: {
		title: 'Created at',
		type: 'date',
		schema: { type: 'date', tableType: 'date-only', sort: true },
	},
};

export default settings;
