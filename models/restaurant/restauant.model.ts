import mongoose, { Schema, Types } from 'mongoose';
import { RestaurantType } from './restaurant.type.js';

const schema = new Schema<RestaurantType>(
	{
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},

		template: {
			type: Number,
			default: 1,
			required: true,
		},

		logo: {
			type: String,
			trim: true,
		},

		image: {
			type: String,
			trim: true,
		},

		coverImage: {
			type: String,
			trim: true,
		},

		location: {
			type: String,
			trim: true,
		},

		email: {
			type: String,
			trim: true,
			required: [true, 'Email is required'],
		},

		phone: {
			type: String,
			trim: true,
		},

		membership: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Membership',
		},

		isDeleted: {
			type: Boolean,
			default: false,
			required: true,
		},

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},
	},

	{
		timestamps: true,
	}
);

const Restaurant = mongoose.model<RestaurantType>('Restaurant', schema);
export { default as settings } from './restaurant.settings.js';
export default Restaurant;
