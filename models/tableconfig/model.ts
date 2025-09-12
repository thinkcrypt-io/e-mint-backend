import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		description: { type: String, default: '', trim: true },
		path: { type: String, required: true, trim: true, lowercase: true, unique: true },
		fields: { type: Array, default: [] },
		model: { type: String, trim: true },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('TableConfig', schema);
