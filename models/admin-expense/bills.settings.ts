import { SettingsType } from '../../imports.js';
import { ACCESS_CONTROL } from '../../lib/index.js';

const billSettings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	name: {
		title: 'Bill Title',
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
				{ label: 'Bdt', value: 'bdt' },
				{ label: 'Usd', value: 'usd' },
				{ label: 'Eur', value: 'eur' },
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
	dueIn: {
		title: 'Due In',
		type: 'string',
		schema: {
			default: true,
			sort: true,
		},
	},
	overDuration: {
		title: 'Over Due By',
		type: 'string',
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
				{ label: 'Due', value: 'due' },
				{ label: 'Paid', value: 'paid' },
				{ label: 'Over Due', value: 'over-due' },
				{ label: 'Void', value: 'void' },
			],
		},
		schema: {
			default: true,
			sort: true,
			type: 'select',
			options: [
				{ label: 'Due', value: 'due' },
				{ label: 'Paid', value: 'paid' },
				{ label: 'Over Due', value: 'over-due' },
				{ label: 'Void', value: 'void' },
			],
		},
	},
	details: {
		title: 'Bill Details',
		type: 'string',

		edit: true,
		schema: { type: 'textarea' },
	},
	refNo: {
		title: 'Ref no',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	dueDate: {
		title: 'Due date',
		type: 'date',
		sort: true,
		edit: true,
		filter: { name: 'dueDaea', type: 'date', label: 'Due date', title: 'Due date' },
		schema: { type: 'date', tableType: 'date-only', sort: true, default: true },
	},
	billDate: {
		title: 'Bill date',
		type: 'date',
		sort: true,
		edit: true,
		filter: { name: 'billDate', type: 'date', label: 'Bill date', title: 'Filter by Bill date' },
		schema: { type: 'date', tableType: 'date-only', sort: true },
	},
	paidAt: {
		title: 'Paid at',
		type: 'date',
		sort: true,

		edit: true,
		schema: { type: 'date', tableType: 'date-only' },
	},
	category: {
		title: 'Category',
		type: 'string',
		search: true,
		edit: true,
		schema: {
			sort: true,
		},
	},
	receipt: {
		title: 'Receipt',
		type: 'uri',
		edit: true,
		schema: { type: 'file' },
	},
	tags: {
		title: 'Tags',
		type: 'array',

		edit: true,
		schema: { type: 'tag' },
	},
	note: {
		title: 'Note',
		type: 'string',

		edit: true,

		schema: {
			type: 'textarea',
		},
	},

	createdAt: {
		title: 'Created at',
		type: 'date',
		schema: { type: 'date', tableType: 'date-only' },
	},
	...ACCESS_CONTROL.SETTINGS,
};

export default billSettings;
