import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,
			trim: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		url: {
			type: String,
			required: true,
			trim: true,
		},
		connectedDomain: {
			type: String,
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
		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		hosting: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Hosting',
		},

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
		note: {
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
		slug: 'url',
		prefix: 'URL',
		initialValue: 0,
		padding: 4,
	})
);

export default mongoose.model<any>('Url', schema);
