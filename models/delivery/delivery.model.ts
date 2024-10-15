import mongoose, { Schema, Types } from 'mongoose';
import { Order, SettingsType, filters } from '../../imports.js';

const schema = new Schema<DeliveryType>(
	{
		invoice: {
			type: String,
			trim: true,
			required: true,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},

		status: {
			type: String,
			enum: [
				'pending',
				'completed',
				'failed',
				'refunded',
				'cancelled',
				'in-transit',
				'out-for-delivery',
				'delayed',
				'returned',
				'awaiting_pickup',
				'partially-delivered',
			],
			default: 'pending',
		},
		order: {
			type: Schema.Types.ObjectId,
			ref: 'Order',
			required: true,
		},

		trackingId: {
			type: String,
			trim: true,
		},
		trackingUrl: {
			type: String,
			trim: true,
		},

		deliveryCompany: {
			type: String,
			trim: true,
		},

		estimatedDeliveryData: {
			type: Date,
		},

		deliveryDate: {
			type: Date,
		},

		receiveAmount: {
			type: Number,
			default: 0,
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

type DeliveryType = {
	invoice: string;
	status: string;
	order: Types.ObjectId;
	deliveryCompany: string;
	trackingId: string;
	trackingUrl: string;
	estimatedDeliveryData: Date;
	deliveryDate: Date;
	receiveAmount: number;
	tags: string[];
	note: string;
	createdAt: Date;
	shop?: Types.ObjectId;
};

export const deliverySettings: SettingsType<DeliveryType> = {
	invoice: {
		sort: true,
		title: 'Invoice',
		type: 'string',
		required: true,
		trim: true,
		unique: true,
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
		sort: true,
		title: 'Delivery Status',
		type: 'string',
		filter: {
			name: 'status',
			field: 'status',
			type: 'multi-select',
			label: 'Delivery Status',
			category: 'distinct',
			title: 'Sort by delivery status',
			key: 'status',
		},
	},

	receiveAmount: {
		edit: true,
		type: 'number',
		title: 'Amount',
		sort: true,
	},
	deliveryCompany: {
		edit: true,
		type: 'string',
		title: 'Delivery Company',
		filter: {
			name: 'deliveryCompany',
			field: 'deliveryCompany',
			type: 'multi-select',
			label: 'Delivery Company',
			title: 'Sort by delivery',
			key: 'deliveryCompany',
			category: 'distinct',
			options: [],
		},
	},
	trackingId: {
		edit: true,
		type: 'string',
		title: 'Tracking ID',
	},

	trackingUrl: {
		edit: true,
		type: 'string',
		title: 'Tracking URL',
	},

	order: {
		edit: true,
		type: 'string',
		title: 'Order',
		required: true,
	},

	note: {
		edit: true,
		type: 'string',
		title: 'Note',
	},

	estimatedDeliveryData: {
		sort: true,
		type: 'string',
		title: 'Estimated Delivery',
	},

	deliveryDate: {
		sort: true,
		type: 'string',
		title: 'Delivery Date',
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
		// filter: filters.tags,
	},
};

const Delivery = mongoose.model<DeliveryType>('Delivery', schema);

export default Delivery;
