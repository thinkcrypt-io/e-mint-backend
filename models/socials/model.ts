import mongoose, { Schema } from 'mongoose';
import { generateSlug } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		slug: {
			type: String,
			unique: true,
			trim: true,
		},
		url: {
			type: String,
			trim: true,
			required: true,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
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

	if (!doc.slug && doc.name) this.slug = generateSlug(doc.name);

	next();
});

export default mongoose.model<any>('Social', schema);
