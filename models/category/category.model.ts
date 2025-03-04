import mongoose, { Schema, Types } from 'mongoose';
import { CategoryType } from './category.type.js';

const schema = new Schema<CategoryType>(
	{
		name: {
			type: String,
			trim: true,
		},
		image: {
			type: String,
			trim: true,
		},
		shortDescription: {
			type: String,
		},
		description: {
			type: String,
			trim: true,
		},
		slug: {
			type: String,
			trim: true,
		},
		parent: {
			type: Types.ObjectId,
			ref: 'Category',
		},

		parentCategory: {
			type: Types.ObjectId,
			ref: 'Category',
		},

		displayInHomePage: {
			type: Boolean,
			default: false,
		},
		displayInMenu: {
			type: Boolean,
			default: false,
		},
		tags: [String],

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		isFeatured: {
			type: Boolean,
			default: false,
			required: true,
		},

		priority: {
			type: Number,
			default: 0,
			required: true,
		},

		isDeleted: {
			type: Boolean,
			default: false,
			required: true,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},
		metaKeywords: [String],
		metaImage: String,
		meta: {
			title: {
				type: String,
			},
			description: {
				type: String,
			},
			keywords: [String],
		},
	},

	{
		timestamps: true,
		toJSON: { virtuals: true }, // Include this line to ensure virtuals are included when converting to JSON
		toObject: { virtuals: true }, // Include this line to ensure virtuals are included when converting to objects
	}
);

// Pre-save middleware to set the slug field
schema.pre('save', function (next) {
	if (!this.slug) {
		this.slug = this.name.toLowerCase().replace(/\s+/g, '-');
	}
	next();
});

const Session = mongoose.model<any>('Category', schema);
export default Session;

// export { default as settings } from './category.settings.js';
