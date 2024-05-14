import mongoose, { Schema } from 'mongoose';
import { ProductType } from './items.types.js';

const schema = new Schema<any>(
	{
		name: { type: String, required: true },
		description: {
			type: String,
		},
		longDescription: {
			type: String,
		},
		calorie: {
			type: Number,
		},

		isActive: { type: Boolean, required: true, default: true },
		restaurant: {
			type: Schema.Types.ObjectId,
			ref: 'Restaurant',
			required: true,
		},

		image: {
			type: String,
		},
		images: [String],
		category: {
			type: Schema.Types.ObjectId,
			ref: 'Category',
			required: true,
		},
		collection: [{ type: Schema.Types.ObjectId, ref: 'Collection' }],

		isFeatured: { type: Boolean, default: false },
		isDeleted: { type: Boolean, default: false },
		price: { type: Number, required: true },
		isDiscount: { type: Boolean, default: false },
		discountPrice: {
			type: Number,
		},

		isVisible: {
			type: Boolean,
			default: true,
		},
	},

	{
		timestamps: true,
		toJSON: { virtuals: true }, // Include this line to ensure virtuals are included when converting to JSON
		toObject: { virtuals: true }, // Include this line to ensure virtuals are included when converting to objects
	}
);

// Add the 'inStock' virtual field
schema.virtual('inStock').get(function (this: any) {
	return this.stock > 0;
});

const Item = mongoose.model<any>('Item', schema);
export default Item;

export { default as settings } from './items.settings.js';
