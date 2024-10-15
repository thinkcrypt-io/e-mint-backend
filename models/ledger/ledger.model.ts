import mongoose, { Schema, Types } from 'mongoose';
import { Order } from '../../imports.js';

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
			ref: 'Supplier',
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
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
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
	shop?: Types.ObjectId;
};

const Ledger = mongoose.model<Type>('Ledger', schema);
export { default as ledgerSettings } from './settings.js';

export default Ledger;
