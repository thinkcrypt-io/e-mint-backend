import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		path: { type: String, required: true, trim: true, lowercase: true },
		description: { type: String, default: '', trim: true },
		slug: { type: String, unique: true, trim: true, lowercase: true },
		model: { type: String, required: true, trim: true },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

//For adding a slug to the document, comment out if not needed or the doc has no slug field
// Pre-save middleware
schema.pre('save', function (next) {
	const doc = this as any;

	if (!doc.slug && doc.path) this.slug = generateSlug(doc.path);

	next();
});

// For adding a code to the document, comment out if not needed or the doc has no code field
// Pre-save hook to auto-increment the document code
schema.pre<any>(
	'save',
	addSequentialCodeMiddleware({
		slug: 'route',
		prefix: 'RTE',
		initialValue: 1,
		padding: 4,
	})
);

export default mongoose.model<any>('Table', schema);
