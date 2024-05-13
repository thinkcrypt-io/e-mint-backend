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
		restaurant: {
			type: Types.ObjectId,
			ref: 'Restaurant',
			required: true,
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

		isFeatured: {
			type: Boolean,
			default: false,
			required: true,
		},
	},

	{
		timestamps: true,
	}
);

const Collection = mongoose.model<CollectionType>('Collection', schema);
export { default as settings } from './collection.settings.js';
export default Collection;
