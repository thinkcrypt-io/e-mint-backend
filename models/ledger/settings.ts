import { SettingsType } from '../../imports.js';
import Customer from '../customer/customer.model.js';

const ledgerSettings: SettingsType<any> = {
	type: {
		sort: true,
		title: 'Type',
		type: 'string',
		required: true,
		trim: true,

		filter: {
			name: 'type',
			field: 'type',
			type: 'multi-select',
			options: [
				{
					label: 'customer',
					value: 'Customer',
				},
				{
					label: 'supplier',
					value: 'Supplier',
				},
			],

			label: 'Type',
			title: 'Sort by type',
		},
	},

	order: {
		sort: true,
		title: 'Order',
		type: 'string',
	},
	note: {
		sort: true,
		title: 'Note',
		type: 'string',
	},
	payment: {
		sort: true,
		title: 'Payment',
		type: 'string',
	},

	customer: {
		edit: true,
		sort: true,
		title: 'Customer',
		type: 'string',
		populate: {
			path: 'customer',
			select: 'name email phone',
		},
		// filter: {
		// 	name: 'customer',
		// 	field: 'customer',
		// 	type: 'multi-select',
		// 	label: 'Customer',
		// 	category: 'model',
		// 	model: Customer,
		// 	title: 'Sort by customer',
		// 	key: 'status',
		// },
	},

	supplier: {
		edit: true,
		sort: true,
		title: 'Supplier',
		type: 'string',
		populate: {
			path: 'supplier',
			select: 'name email phone',
		},
		// filter: {
		// 	name: 'supplier',
		// 	field: 'supplier',
		// 	type: 'multi-select',
		// 	label: 'Supplier',
		// 	category: 'model',
		// 	model: Customer,
		// 	title: 'Sort by supplier',
		// 	key: 'status',
		// },
	},

	amount: {
		edit: true,
		type: 'number',
		title: 'Amount',
		sort: true,
	},

	amountReceived: {
		edit: true,
		type: 'number',
		title: 'Amount Received',
		sort: true,
	},
	amountSent: {
		edit: true,
		type: 'number',
		title: 'Amount Sent',
		sort: true,
	},
	account: {
		edit: true,
		type: 'string',
		title: 'Amount',
		sort: true,
		filter: {
			name: 'account',
			field: 'account',
			type: 'multi-select',
			label: 'Account',
			title: 'Sort by account',
			options: [
				{
					label: 'debit',
					value: 'Debit',
				},
				{
					label: 'credit',
					value: 'Credit',
				},
			],
		},
	},

	date: {
		sort: true,
		type: 'string',
		title: 'Date',
	},
};

export default ledgerSettings;
