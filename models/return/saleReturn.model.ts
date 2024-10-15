import mongoose, { Schema, Types } from 'mongoose';
import { SettingsType, filters } from '../../imports.js';

const schema = new Schema<PaymentType>(
	{
		invoice: {
			type: String,
			trim: true,
			required: true,
		},

		status: {
			type: String,
			enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
			default: 'pending',
		},
		items: [
			{
				name: { type: String, required: true },
				image: { type: String },
				_id: { type: Schema.Types.ObjectId, required: true, ref: 'Product', populate: 'Product' },
				qty: { type: Number, required: true },
				returnQty: { type: Number, required: true },
				returnAmount: { type: Number, required: true },
				unitPrice: { type: Number, required: true },
				totalPrice: { type: Number },
				vat: { type: Number, required: true },
			} as Record<string, any>,
		],
		reason: {
			type: String,

			required: true,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},

		otherReason: {
			type: String,
			trim: true,
		},

		reference: String,

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
	reason: string;
	otherReason: string;
	date: Date;
	tags: string[];
	note: string;
	customer: Types.ObjectId;
	reference: string;
	status: 'pending' | 'completed' | 'failed' | 'refunded';
	items: [];
	createdAt: Date;
	shop?: Types.ObjectId;
};

export const returnSettings: SettingsType<PaymentType> = {
	invoice: {
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

	items: {
		title: 'Items',
		type: 'array-object',
	},

	reason: {
		edit: true,
		title: 'Reason',
		type: 'string',
		required: true,
		filter: {
			name: 'reason',
			field: 'reason',
			type: 'multi-select',
			label: 'Reason',
			category: 'distinct',
			title: 'Sort by reason',
			key: 'reason',
		},
	},

	otherReason: {
		edit: true,
		title: 'Other Reason',
		type: 'string',
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

	reference: {
		edit: true,
		title: 'Reference',
		type: 'string',
		trim: true,
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
};

const Return = mongoose.model<any>('Return', schema);

export default Return;
