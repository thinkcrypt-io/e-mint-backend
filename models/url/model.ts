import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		project: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Project',
			required: true,
		},
		client: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Client',
			required: true,
		},
		category: {
			type: String,
			required: true,
			enum: ['frontend', 'backend', 'admin', 'other'],
		},
		status: {
			type: String,
			enum: ['live', 'inactive', 'maintenance'],
			default: 'live',
		},
		hostingPlatform: {
			type: String,
			trim: true,
			required: true,
		},
		// hostingPlatformAccoung: {
		// 	type: String,
		// 	trim: true,
		// 	required: true,
		// },
		gitRepo: {
			type: String,
			trim: true,
		},
		gitAccount: {
			type: String,
			trim: true,
		},
		branch: {
			type: String,
			trim: true,
			default: 'main',
		},
		cPanelInformation: {
			type: String,
			trim: true,
		},
		version: {
			type: String,
			trim: true,
			default: '0.0.1',
		},
		environment: {
			type: String,
			enum: ['production', 'staging', 'demo', 'test'],
			required: true,
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
