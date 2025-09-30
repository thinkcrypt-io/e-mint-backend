import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		description: { type: String, default: '', trim: true },
		path: { type: String, required: true, trim: true, lowercase: true, unique: true },
		fields: {
			required: true,
			type: [
				{
					sectionTitle: String,
					description: String,
					collapsible: Boolean,
					fields: Array,
				},
			],
		},
		schema: {
			type: String,
			required: true,
		},
		model: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Model',
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('FormField', schema);
