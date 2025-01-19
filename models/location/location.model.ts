import mongoose, { Schema } from 'mongoose';
import LocationType from './location.types.js';

const schema = new Schema<LocationType>(
	{
		name: { type: String, required: true, trim: true },
		shortDescription: {
			type: String,
			trim: true,
		},
		phone: String,
		email: String,
		description: {
			type: String,
		},
		isActive: { type: Boolean, required: true, default: true },

		image: {
			type: String,
		},

		address: String,
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},

		tags: [String],
	},

	{
		timestamps: true,
		toJSON: { virtuals: true }, // Include this line to ensure virtuals are included when converting to JSON
		toObject: { virtuals: true }, // Include this line to ensure virtuals are included when converting to objects
	}
);

const Location = mongoose.model<LocationType>('Location', schema);
export default Location;
