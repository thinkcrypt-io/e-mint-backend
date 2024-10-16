import { SettingsType } from '../../imports';
import mongoose, { Schema } from 'mongoose';

type PurchaseType = {
	supplier: Schema.Types.ObjectId;
	status: string;
	shop: Schema.Types.ObjectId;
	date: Date;
	items: object;
	createdAt: Date;
	shippingCost: number;
	subTotal: number;
	discount: number;
	discountType: string;
	discountAmount: number;
	total: number;
	paymentType: string;
	paymentStatus: string;
	paymentId: string;
	paymentGateway: string;
	paymentResponse: object;
	paymentDate: Date;
	deliveryDate: Date;
	deliveryAddress: object;
	deliveryNote: string;
	isPaid: boolean;
	paidAmount: number;
	returnedAmount: number;
	dueAmount: number;
	note: string;
	isDelivered: boolean;
	isCancelled: boolean;
	invoice: string;
};

const schema = new Schema<PurchaseType>({
	invoice: { type: String },
	supplier: {
		type: Schema.Types.ObjectId,
		ref: 'Supplier',
		required: true,
	},
	status: {
		type: String,
		enum: ['pending', 'completed', 'partially-delivered', 'delivered', 'cancelled'],
		default: 'pending',
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
	items: [
		{
			price: { type: Number, required: true },
			qty: { type: Number, required: true },
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

	isCancelled: {
		type: Boolean,
		default: false,
		required: true,
	},
	isDelivered: {
		type: Boolean,
		default: false,
		required: true,
	},
});

schema.virtual('totalItems').get(function () {
	if (!Array.isArray(this.items)) {
		return 0;
	}
	return this.items.reduce((total: number, item: any): number => {
		return total + (item.qty || 0);
	}, 0);
});

export const purchaseSettings: SettingsType<any> = {
	invoice: {
		sort: true,
		title: 'Invoice',
		type: 'string',
		required: true,
		filter: {
			name: 'invoice',
			field: 'invoice',
			type: 'text',
			label: 'Invoice',
			title: 'Search Invoice',
		},
	},
	supplier: {
		sort: true,
		title: 'Supplier',
		type: 'string',
		required: true,
		populate: {
			path: 'Supplier',
			select: 'name email',
		},
	},
	dueAmount: {
		sort: true,
		title: 'Due Amount',
		type: 'number',
		required: true,
	},
	paidAmount: {
		sort: true,
		title: 'Paid Amount',
		type: 'number',
	},
	subTotal: {
		sort: true,
		title: 'Sub Total',
		type: 'number',
	},
	total: {
		sort: true,
		title: 'Total',
		type: 'number',
	},
	discount: {
		sort: true,
		title: 'Discount',
		type: 'number',
	},
	shippingCost: {
		sort: true,
		title: 'Shipping Cost',
		type: 'number',
	},
	totalItems: {
		sort: true,
		title: 'Total Items',
		type: 'number',
	},
	status: {
		sort: true,
		title: 'Status',
		type: 'string',
		required: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Status',
			options: [
				{ label: 'Pending', value: 'pending' },
				{ label: 'Completed', value: 'completed' },
				{ label: 'Partially Delivered', value: 'partially-delivered' },
				{ label: 'Delivered', value: 'delivered' },
				{ label: 'Cancelled', value: 'cancelled' },
			],
		},
	},
	isCancelled: {
		sort: true,
		title: 'Is Cancelled',
		type: 'boolean',
		required: true,
		edit: true,
		filter: {
			name: 'isCancelled',
			field: 'isCancelled',
			type: 'boolean',
			label: 'Is Cancelled',
			title: 'Is Cancelled',
		},
	},
	isPaid: {
		sort: true,
		title: 'Is Paid',
		type: 'boolean',
		required: true,
		edit: true,
		filter: {
			name: 'isPaid',
			field: 'isPaid',
			type: 'boolean',
			label: 'Paid',
			title: 'Is Paid',
		},
	},
};

const Purchase = mongoose.model<PurchaseType>('Purchase', schema);
export default Purchase;
