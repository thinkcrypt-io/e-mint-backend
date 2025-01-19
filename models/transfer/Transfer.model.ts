import mongoose, { Schema, Types } from 'mongoose';
// import LocationType from './location.types.js';

type Type = {
	product?: Types.ObjectId;
	products?: {
		product?: Types.ObjectId;
		quantity?: number;
	}[];
	destination: Types.ObjectId;
	source?: Types.ObjectId;
	quantity?: number;
	reason: 'restock' | 'return' | 'relocation' | 'damage' | 'other';
	shop: Types.ObjectId;
	status?:
		| 'initiated'
		| 'completed'
		| 'cancelled'
		| 'pending'
		| 'approved'
		| 'failed'
		| 'rejected'
		| 'transit'
		| 'delivered'
		| 'received'
		| 'dispatched'
		| 'returned';
	type?: 'mtl' | 'ltl' | 'ltm';
	ref?: String;
	date: Date;
};

const schema = new Schema<Type>(
	{
		product: { type: Schema.Types.ObjectId, ref: 'Product' },
		date: { type: Date, default: Date.now },
		products: [
			{
				product: { type: Schema.Types.ObjectId, ref: 'Product' },
				quantity: { type: Number, min: 0 },
				damagedQty: { type: Number, min: 0, default: 0 },
				receivedQty: { type: Number, min: 0, default: 0 },
				toReceive: { type: Number, min: 0, default: 0 },
				status: {
					type: String,
					default: 'pending',
				},
			},
		],
		destination: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
		source: { type: Schema.Types.ObjectId, ref: 'Location' },
		quantity: { type: Number, min: 0 },
		reason: {
			type: String,
			required: true,
			enum: ['restock', 'return', 'relocation', 'damage', 'other'],
			default: 'restock',
		},
		shop: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
		status: {
			type: String,
			enum: [
				'initiated',
				'completed',
				'cancelled',
				'pending',
				'approved',
				'failed',
				'rejected',
				'transit',
				'delivered',
				'received',
				'dispatched',
				'returned',
			],
			default: 'initiated',
		},
		ref: { type: String, trim: true },
		type: {
			type: String,
			enum: ['mtl', 'ltl', 'ltm'],
			default: 'mtl',
		},
	},

	{
		timestamps: true,
		toJSON: { virtuals: true }, // Include this line to ensure virtuals are included when converting to JSON
		toObject: { virtuals: true }, // Include this line to ensure virtuals are included when converting to objects
	}
);

// Total Inventory Sell value
schema.virtual('totalQty').get(function (this: any) {
	let totalValue = 0;
	this.products?.forEach((inv: any) => {
		totalValue += inv.quantity;
	});
	return totalValue;
});

// Generate unique reference number before saving
schema.pre('save', async function (next: any) {
	if (this.isNew) {
		if (this.ref) next();
		const date = new Date();
		const year = date.getFullYear().toString().slice(-2);
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const count = (await mongoose.model('Transfer').countDocuments()) + 1;
		this.ref = `TRF${year}${month}${count.toString().padStart(5, '0')}`;
	}
	next();
});

const Transfer = mongoose.model<Type>('Transfer', schema);
export default Transfer;
