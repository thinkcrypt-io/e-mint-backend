import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		name: { type: String, required: true },
		position: { type: String, required: true },
		department: { type: String, required: true },
		location: { type: String, required: true },
		type: { type: String, required: true }, // e.g. Full-time, Part-time, Internship
		// description: { type: String, required: true },
		excerpt: { type: String, required: true },
		// slug: { type: String },
		code: { type: String },
		metaTitle: { type: String },
		metaDescription: { type: String },
		status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
		endDate: { type: Date, required: true },
		description: {
			type: String,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	},
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
		slug: 'vacancy',
		prefix: 'VCN',
		initialValue: 5,
		padding: 4,
	}),
);

export default mongoose.model<any>('Vacancy', schema);
