// Define the Variation sub-schema
import mongoose, { Schema } from 'mongoose';

const variationSchema = new Schema({
	name: { type: String, required: true },
	description: {
		type: String,
		trim: true,
	},
	sku: { type: String, trim: true },
	price: { type: Number, required: true },
	cost: { type: Number, default: 0 },
	stock: { type: Number, default: 0, required: true },

	attributes: [
		{
			label: { type: String },
			value: { type: String },
		},
	],
	images: [String],
	// isDiscount: { type: Boolean, default: false },
	// discountType: { type: String, enum: ['percentage', 'flat'] },
	// discount: { type: Number, default: 0 },
	// discountedPrice: { type: Number },
});

// Before saving, convert string numbers to actual numbers
variationSchema.pre('save', function (next) {
	if (typeof this.price === 'string') this.price = Number(this.price);
	if (typeof this.cost === 'string') this.cost = Number(this.cost);
	if (typeof this.stock === 'string') this.stock = Number(this.stock);
	next();
});

export default variationSchema;
