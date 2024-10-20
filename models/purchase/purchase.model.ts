import Product from '../products/products.model.js';
import { PurchaseType } from './index.js';
import mongoose, { Schema } from 'mongoose';

const schema = new Schema<PurchaseType>({
	invoice: { type: String },
	supplier: {
		type: Schema.Types.ObjectId,
		ref: 'Supplier',
		required: true,
	},

	shop: {
		type: Schema.Types.ObjectId,
		ref: 'Shop',
		required: true,
	},
	date: {
		type: Date,
		required: true,
	},
	deliveryDate: {
		type: Date,
	},
	addedBy: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	},
	items: [
		{
			name: { type: String, required: true },
			price: { type: Number, required: true },
			qty: { type: Number, required: true },
			deliveredQty: { type: Number, default: 0 },
			_id: {
				type: mongoose.Schema.Types.ObjectId,
				required: true,
				ref: 'Product',
			},
			batchNumber: { type: String },
			discount: { type: Number },
			productionDate: { type: Date },
			expireDate: { type: Date },
			subTotal: { type: Number, required: true },
		},
	],
	subTotal: {
		type: Number,
		required: true,
		default: 0,
	},
	shippingCost: {
		type: Number,
		required: true,
		default: 0,
	},
	total: {
		type: Number,
		required: true,
		default: 0,
	},
	discount: {
		type: Number,
		default: 0,
		required: true,
	},
	paidAmount: {
		type: Number,
		default: 0,
		required: true,
	},
	returnedAmount: {
		type: Number,
		default: 0,
		required: true,
	},
	dueAmount: {
		type: Number,
		default: 0,
		required: true,
	},
	status: {
		type: String,
		enum: ['pending', 'completed', 'partially-delivered', 'delivered', 'cancelled'],
		default: 'pending',
	},

	isCancelled: {
		type: Boolean,
		default: false,
		required: true,
	},
	note: {
		type: String,
	},
	isDelivered: {
		type: Boolean,
		default: false,
		required: true,
	},
});
schema.virtual('totalItems').get(function (this: any) {
	if (!Array.isArray(this.items)) {
		return 0;
	}
	return this.items.reduce((total: number, item: any): number => {
		return total + (item.qty || 0);
	}, 0);
});

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.status == 'delivered') {
			this.isDelivered = true;

			for (const item of this.items) {
				const product = await Product.findById(item._id);

				if (product) {
					if (item.deliveredQty < item.qty) {
						item.deliveredQty = item.qty;
						const product = await Product.findById(item._id);
						if (product) {
							product.stock += item.qty;
							await product.save();
						}
					}
				}
			}
		}
		next();
	} catch (error: any) {
		console.log('Error Updating item Qty:', error);
		next();
	}
});

const Purchase = mongoose.model<PurchaseType>('Purchase', schema);
export default Purchase;
