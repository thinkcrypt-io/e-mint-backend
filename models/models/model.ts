import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		route: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			unique: true,
		},
		isActive: {
			type: Boolean,
			required: true,
			default: true,
		},
		description: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

// For adding a code to the document, comment out if not needed or the doc has no code field
// Pre-save hook to auto-increment the document code
schema.pre<any>(
	'save',
	addSequentialCodeMiddleware({
		slug: 'model',
		prefix: 'MDL',
		initialValue: 0,
		padding: 4,
	})
);

export default mongoose.model<any>('Model', schema);
