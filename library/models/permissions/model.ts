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
			create: { type: Boolean, default: false },
			view: { type: Boolean, default: false },
			edit: { type: Boolean, default: false },
			delete: { type: Boolean, default: false },
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('Permission', schema);
