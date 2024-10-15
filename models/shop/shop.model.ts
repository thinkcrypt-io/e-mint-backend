import mongoose, { Schema, Types } from 'mongoose';
// import { RestaurantType } from './restaurant.type.js';

const schema = new Schema<any>(
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
		address: {
			type: String,
			trim: true,
		},

		email: {
			type: String,
			trim: true,
			required: [true, 'Email is required'],
		},

		expire: {
			type: Date,
			required: true,
		},

		trial: {
			type: Boolean,
			default: true,
			required: true,
		},

		phone: {
			type: String,
			trim: true,
		},

		package: {
			type: mongoose.Schema.Types.Mixed,
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

const Shop = mongoose.model<any>('Shop', schema);
//export { default as settings } from './restaurant.settings.js';
export default Shop;
