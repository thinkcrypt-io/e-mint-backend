import mongoose, { Schema } from 'mongoose';
import { OrderType, OrderItemType } from './order.types';

const schema: Schema = new Schema<OrderType>(
	{
		// store: { type: Schema.Types.ObjectId, required: true, ref: 'Store' },
		user: { type: Schema.Types.ObjectId, ref: 'User' },
		items: [
			{
				name: { type: String, required: true },
				image: { type: String },
				_id: { type: Schema.Types.ObjectId, required: true, ref: 'Product', populate: 'Product' },
				qty: { type: Number, required: true },
				unitPrice: { type: Number, required: true },
				totalPrice: { type: Number },
				vat: { type: Number, required: true },
			} as Record<string, any>,
		],
		total: { type: Number, required: true, default: 0 },
		vat: { type: Number, required: true, default: 0 },
		subTotal: { type: Number, required: true, default: 0 },
		coupon: { type: Schema.Types.ObjectId, ref: 'Coupon' },
		isPaid: { type: Boolean, default: false },
		paidAmount: { type: Number, default: 0 },
		profit: { type: Number, default: 0, required: true },
		dueAmount: { type: Number, default: 0 },
		address: { type: Schema.Types.Mixed },
		shippingCharge: { type: Number, required: true, default: 0 },
		// delivery: { type: Schema.Types.ObjectId, ref: 'Delivery' },
		paymentMethod: { type: String },
		status: { type: String, default: 'order-placed' },
		// transactions: { type: Schema.Types.ObjectId, ref: 'Transaction' },
		customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
		orderDate: { type: Date, default: Date.now, required: true },
		isCancelled: { type: Boolean, default: false, required: true },
		discount: { type: Number, default: 0, required: true },
		isDelivered: { type: Boolean, default: false, required: true },
		note: { type: String },
		courier: {
			type: String,
		},
		trackingNumber: {
			type: String,
		},
		trackingUrl: {
			type: String,
		},

		origin: {
			type: String,
			enum: ['pos', 'website'],
			default: 'pos',
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

schema.virtual('totalItems').get(function () {
	if (!Array.isArray(this.items)) {
		return 0;
	}
	return this.items.reduce((total: number, item: OrderItemType): number => {
		return total + (item.qty || 0);
	}, 0);
});

const Order = mongoose.model<OrderType>('Order', schema);
export default Order;
export { default as settings } from './order.settings.js';
