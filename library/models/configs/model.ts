import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		description: { type: String, default: '', trim: true },
		path: { type: String, required: true, trim: true, lowercase: true, unique: true },
		tableFields: { type: Array, default: [] },
		viewFields: { type: Array, default: [] },
		isDisabled: { type: Boolean, default: false },
		formFields: {
			required: true,
			strict: false,
			type: [{}],
		},

		sch: {
			type: String,
			required: true,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('Config', schema);
