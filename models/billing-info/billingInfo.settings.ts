import { BillingInfoSettings } from './billingInfo.types';

const settings: BillingInfoSettings = {
	transactionId: {
		title: 'Transaction Id',
		type: 'string',
		edit: true,
		search: true,
		unique: true,
	},
	transactionTime: {
		title: 'Transaction Time',
		type: 'string',
		edit: true,
	},
	amount: {
		title: 'Transaction Amount',
		type: 'number',
		edit: true,
		sort: true,
		filter: {
			type: 'range',
			field: 'amount',
			name: 'amount',
			label: 'Amount Filter',
			title: 'Sort By Amount',
		},
	},

	createdAt: {
		type: 'string',
		title: 'Date',
		sort: true,
		filter: {
			type: 'date',
			name: 'createdAt',
			field: 'createdAt',
			label: 'Create At',
			title: 'Sort By Date',
		},
	},
};

export default settings;
