import mongoose, { Schema, Types } from 'mongoose';
import { CollectionType } from './collection.types.js';

const schema = new Schema<CollectionType>(
	{
		name: {
			type: String,
			trim: true,
			required: [true, 'Name is required'],
		},
		dataKey: {
			type: String,
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},

		priority: {
			type: Number,
			defailt: 0,
		},
		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},
		image: {
			type: String,
			trim: true,
		},
		images: [
			{
				type: String,
				trim: true,
			},
		],

		displayInHome: {
			type: Boolean,
			default: false,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},

		displayInMenu: {
			type: Boolean,
			default: false,
		},

		isFeatured: {
			type: Boolean,
			default: false,
			required: true,
		},
		metaKeywords: [String],
		metaImage: String,
		meta: {
			title: {
				type: String,
				trim: true,
			},
			keywords: {
				type: [String],
			},
			description: {
				type: String,
				trim: true,
			},
		},
	},

	{
		timestamps: true,
	}
);

const Collection = mongoose.model<CollectionType>('Collection', schema);
export { default as settings } from './collection.settings.js';
export default Collection;
