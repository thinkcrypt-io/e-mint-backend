import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		icon: {
			type: String,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},

		description: {
			type: String,
			required: true,
			trim: true,
		},
		priority: {
			type: Number,
			default: 1,
			required: true,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true,
	}
);

const Service = mongoose.model<any>('Service', schema);
export default Service;
