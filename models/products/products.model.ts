import mongoose, { Schema } from 'mongoose';
import variationSchema from './productVariation.js';

const schema = new Schema<any>(
	{
		name: { type: String, required: true },
		shortDescription: {
			type: String,
			trim: true,
		},
		description: {
			type: String,
		},
		isActive: { type: Boolean, required: true, default: true },

		unit: {
			type: String,
		},
		unitValue: {
			type: Number,
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
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},
		collection: [{ type: Schema.Types.ObjectId, ref: 'Collection' }],
		brand: {
			type: Schema.Types.ObjectId,
			ref: 'Brand',
		},
		isFeatured: { type: Boolean, default: false },
		cost: {
			type: Number,
			default: 0,
			required: true,
		},
		price: { type: Number, required: true },

		isDiscount: { type: Boolean, default: false },
		discountType: {
			type: String,
			enum: ['percentage', 'flat'],
		},
		discount: {
			type: Number,
			default: 0,
		},

		sku: {
			type: String,
			trim: true,
		},
		slug: {
			type: String,
			toLowerCase: true,
			trim: true,
		},
		weight: {
			type: Number,
			default: 0, // Weight in grams or other units
		},
		dimensions: {
			length: { type: Number, default: 0 }, // in cm
			width: { type: Number, default: 0 }, // in cm
			height: { type: Number, default: 0 }, // in cm
		},
		barcode: {
			type: String,
			trim: true,
		},

		tags: [String],

		allowStock: { type: Boolean, default: true },
		stock: { type: Number, default: 0, required: true },
		damage: { type: Number, default: 0, required: true },
		lowStockAlert: { type: Number, default: 0 },
		variations: [{ type: variationSchema }],

		status: {
			type: String,
			enum: ['draft', 'published', 'archived'],
			default: 'draft',
		},

		customAttributes: [
			{
				label: { type: String },
				value: { type: String },
			},
		],
		customSections: [
			{
				title: { type: String },
				description: { type: String },
			},
		],

		extraAttributes: { type: Schema.Types.Mixed },
		discountedPrice: {
			type: Number,
		},

		vat: {
			type: Number,
			required: true,
			default: 0,
		},

		isVisible: {
			type: Boolean,
			default: true,
		},
		inventory: [
			{
				location: {
					type: Schema.Types.ObjectId,
					ref: 'Location',
				},
				stock: {
					type: Number,
					default: 0,
				},
				damage: {
					type: Number,
					default: 0,
				},
				reservedStock: {
					type: Number,
					default: 0,
				},
				incomingStock: {
					type: Number,
					default: 0,
				},
			},
		],
		metaKeywords: [String],
		metaImage: String,
		meta: {
			title: {
				type: String,
			},
			description: {
				type: String,
			},
			// keywords: [String],
		},
		faq: [
			{
				title: { type: String },
				description: { type: String },
			},
		],
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

//Total Stock
schema.virtual('totalStock').get(function (this: any) {
	let totalStock = 0;
	this.inventory?.forEach((inv: any) => {
		totalStock += inv.stock;
	});
	return totalStock + this.stock;
});

//Total Inventory Sell value
schema.virtual('totalInventorySellValue').get(function (this: any) {
	let totalValue = 0;
	this.inventory?.forEach((inv: any) => {
		totalValue += inv.stock * this.price;
	});
	return totalValue + this.stock * this.price;
});

//Total Inventory Sell value
schema.virtual('stockInTransit').get(function (this: any) {
	let totalValue = 0;
	this.inventory?.forEach((inv: any) => {
		totalValue += inv.incomingStock;
	});
	return totalValue;
});

// Pre-save middleware to set the slug field
schema.pre('save', function (next) {
	if (!this.slug) {
		if (!this.name) return;
		this.slug = (this.name as any).toLowerCase().replace(/\s+/g, '-');
	}
	next();
});

// Define the virtual property
schema.virtual('inventoryCostPrice').get(function (this: any) {
	return this.price * this.stock;
});

// Define the virtual property
schema.virtual('inventorySellPrice').get(function (this: any) {
	return this.price * this.stock;
});

const Product = mongoose.model<any>('Product', schema);
export default Product;

export { default as settings } from './products.settings.js';
