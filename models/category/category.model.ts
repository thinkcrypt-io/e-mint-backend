import mongoose, { Schema, Types } from 'mongoose';
import { CategoryType } from './category.type.js';

const schema = new Schema<CategoryType>(
	{
		name: {
			type: String,
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		restaurant: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Restaurant',
		},
		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		priority: {
			type: Number,
			default: 0,
			required: true,
		},

		image: {
			type: String,
			trim: true,
		},

		isDeleted: {
			type: Boolean,
			default: false,
			required: true,
		},
	},

	{
		timestamps: true,
	}
);

const Session = mongoose.model<any>('Category', schema);
export { default as settings } from './category.settings.js';
export default Session;
