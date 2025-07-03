import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: true,
		},
		description: {
			type: String,
		},
		key: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			lowercase: true,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		options: {
			create: Boolean,
			view: Boolean,
			edit: Boolean,
			delete: Boolean,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('Permission', schema);
