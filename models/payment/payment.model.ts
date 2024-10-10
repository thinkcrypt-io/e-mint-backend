import { required } from 'joi';
import mongoose, { Schema, Types } from 'mongoose';
// import { CategoryType } from './category.type.js';
import { SettingsType, filters } from '../../imports.js';

const schema = new Schema<PaymentType>(
	{
		invoice: {
			type: String,
			trim: true,
		},
		currency: String,
		attachments: [String],
		status: {
			type: String,
			enum: ['pending', 'completed', 'failed', 'refunded'],
			default: 'pending',
		},
		// checkNo: String,
		// walletNo: String,
		amount: {
			type: Number,
			required: true,
		},
		order: {
			type: Schema.Types.ObjectId,
			ref: 'Order',
		},
		customer: {
			type: Schema.Types.ObjectId,
			ref: 'Customer',
		},
		trnxId: String,
		reference: String,
		paymentMethod: {
			type: String,
			enum: [
				'cash',
				'cheque',
				'card',
				'bank',
				'bkash',
				'nagad',
				'rocket',
				'ssl',
				'stripe',
				'other',
			],
			required: true,
		},

		account: {
			type: String,
			enum: ['debit', 'credit'],
			required: true,
		},
		date: {
			type: Date,
			required: true,
			default: Date.now,
		},
		tags: [String],
		note: {
			type: String,
			trim: true,
		},
	},

	{
		timestamps: true,
	}
);

type PaymentType = {
	invoice: string;
	amount: number;
	order: Types.ObjectId;
	//category: string;
	date: Date;
	tags: string[];
	note: string;
	account: 'debit' | 'credit';
	customer: Types.ObjectId;
	trnxId: string;
	paymentMethod:
		| 'cash'
		| 'cheque'
		| 'card'
		| 'bank'
		| 'bkash'
		| 'nagad'
		| 'rocket'
		| 'other'
		| 'ssl'
		| 'stripe';
	reference: string;
	currency: string;
	status: 'pending' | 'completed' | 'failed' | 'refunded';
	attachments: string[];
	// checkNo: string;
	// walletNo: string;
	createdAt: Date;
};

export const paymentSettings: SettingsType<PaymentType> = {
	invoice: {
		edit: true,
		sort: true,
		// search: true,
		title: 'Invoice',
		type: 'string',
		required: true,
		trim: true,
		filter: {
			name: 'invoice',
			field: 'invoice',
			type: 'text',
			label: 'Invoice',
			title: 'Sort by invoice',
		},
	},

	status: {
		edit: true,
		title: 'Status',
		type: 'string',
	},

	customer: {
		edit: true,
		title: 'Customer',
		type: 'string',
	},
	attachments: {
		edit: true,
		title: 'Attachments',
		type: 'array-string',
	},

	trnxId: {
		edit: true,
		title: 'Transaction Id',
		type: 'string',

		filter: {
			name: 'trnxId',
			field: 'trnxId',
			type: 'text',
			label: 'Tranx Id',
			title: 'Sort by transaction id',
		},
	},

	reference: {
		edit: true,
		title: 'Reference',
		type: 'string',
		trim: true,
		filter: {
			name: 'reference',
			field: 'reference',
			type: 'text',
			label: 'Ref',
			title: 'Sort by reference Id',
		},
	},

	amount: {
		edit: true,
		type: 'number',
		title: 'Amount',
		required: true,
		sort: true,
		filter: {
			name: 'amount',
			field: 'amount',
			type: 'range',
			label: 'Amount',
			title: 'Sort by amount',
		},
	},

	order: {
		edit: true,
		type: 'string',
		title: 'Order',
	},

	note: {
		edit: true,
		type: 'string',
		title: 'Note',
	},

	date: {
		sort: true,
		type: 'string',
		title: 'Date',
		required: true,
		filter: {
			name: 'date',
			field: 'date',
			type: 'date',
			label: 'Date',
			title: 'Sort by expense date',
		},
	},

	paymentMethod: {
		edit: true,
		type: 'string',
		title: 'Payment Method',
		required: true,
		filter: {
			name: 'paymentMethod',
			field: 'paymentMethod',
			type: 'multi-select',
			label: 'Payment Method',
			title: 'Sort by payment method',
			category: 'distinct',
		},
	},

	currency: {
		edit: true,
		type: 'string',
		title: 'Currency',
	},

	account: {
		edit: true,
		sort: true,
		title: 'Account',
		type: 'string',
		required: true,
		filter: {
			name: 'account',
			field: 'account',
			type: 'multi-select',
			label: 'Account',
			title: 'Sort by account',
			options: [
				{ label: 'Debit', value: 'debit' },
				{ label: 'Credit', value: 'credit' },
			],
		},
	},

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
	},

	tags: {
		edit: true,
		sort: true,
		title: 'Tags',
		type: 'array-string',
		filter: filters.tags,
	},
	// walletNo: {
	// 	edit: true,
	// 	title: 'Wallet No',
	// 	type: 'string',
	// },
};

const Payment = mongoose.model<any>('Payment', schema);

export default Payment;
