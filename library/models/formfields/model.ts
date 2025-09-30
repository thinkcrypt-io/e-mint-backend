import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		description: { type: String, default: '', trim: true },
		path: { type: String, required: true, trim: true, lowercase: true, unique: true },
		formFields: {
			required: true,
			type: [
				{
					sectionTitle: String,
					description: String,
					collapsible: Boolean,
					fields: [{}],
					// fields: {
					// 	type: [Schema.Types.Mixed], // Allow mixed types (strings and arrays)
					// 	required: true,
					// },
				},
			],
		},
		schema: {
			type: String,
			required: [true, 'Schema is required'],
		},
		// model: {
		// 	type: mongoose.Schema.Types.ObjectId,
		// 	ref: 'Model',
		// },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('FormField', schema);
