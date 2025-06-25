import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib';

const schema = new Schema<any>(
	{},
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

	if (!doc.metaTitle) {
		this.metaTitle = doc.name ? doc.name.substring(0, 60) : '';
	}

	if (!doc.metaDescription) {
		this.metaDescription = doc.excerpt ? doc.excerpt.substring(0, 160) : '';
	}

	next();
});

// For adding a code to the document, comment out if not needed or the doc has no code field
// Pre-save hook to auto-increment the document code
schema.pre<any>(
	'save',
	addSequentialCodeMiddleware({
		slug: 'blog',
		prefix: 'TBG',
		initialValue: 5,
		padding: 4,
	})
);

export default mongoose.model<any>('Template', schema);
