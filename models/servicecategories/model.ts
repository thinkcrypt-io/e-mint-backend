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

const ServiceCat = mongoose.model<any>('Servicecategory', schema);
export default ServiceCat;
