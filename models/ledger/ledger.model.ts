import mongoose, { Schema, Types } from 'mongoose';
import { Order, SettingsType } from '../../imports.js';
import Customer from '../customer/customer.model.js';

const schema = new Schema<Type>(
	{
		type: {
			type: String,
			enum: ['customer', 'admin', 'supplier', 'delivery'],
			required: true,
		},
		customer: {
			type: Schema.Types.ObjectId,
			ref: 'Customer',
		},
		note: {
			type: String,
		},
		supplier: {
			type: Schema.Types.ObjectId,
		},
		amountReceived: {
			type: Number,
			default: 0,
		},
		amountSent: {
			type: Number,
			default: 0,
		},
		amount: {
			type: Number,
			default: 0,
			required: true,
		},
		payment: {
			type: Schema.Types.ObjectId,
			ref: 'Payment',
		},
		order: {
			type: Schema.Types.ObjectId,
			ref: 'Order',
		},
		account: {
			type: String,
			enum: ['debit', 'credit'],
			required: true,
		},
		date: {
			type: Date,
			default: Date.now,
		},
	},

	{
		timestamps: true,
	}
);

// Pre-save hook to auto-increment the invoice number
schema.post<any>('save', async function (next) {
	try {
		// Find the counter document
		let order: any = await Order.findById(this.order);
		if (!order) {
			return;
		}
		// Increment the sequence value
		order.delivery = this._id;
		if (this.status == 'completed') {
			order.status = 'delivered';
			order.isDelivered = true;
		}
		await order.save();
	} catch (error: any) {
		console.error('Error updating order with delivery ID:', error);
	}
});

type Type = {
	type: 'customer' | 'admin' | 'supplier' | 'delivery';
	customer: Types.ObjectId;
	supplier?: Types.ObjectId;
	amountReceived: number;
	amountSent: number;
	amount: number;
	payment: Types.ObjectId;
	order: Types.ObjectId;
	account: 'debit' | 'credit';
	date: Date;
	note: string;
};

export const ledgerSettings: SettingsType<Type> = {
	type: {
		sort: true,
		title: 'Type',
		type: 'string',
		required: true,
		trim: true,
		filter: {
			name: 'invoice',
			field: 'invoice',
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
		filter: {
			name: 'customer',
			field: 'customer',
			type: 'multi-select',
			label: 'Customer',
			category: 'model',
			model: Customer,
			title: 'Sort by customer',
			key: 'status',
		},
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

const Ledger = mongoose.model<Type>('Ledger', schema);

export default Ledger;
