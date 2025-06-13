import mongoose, { Schema } from 'mongoose';

// The TypeScript type for the model (any)
export type NpmLibrary = any;

// Mongoose schema for an NPM library
const NpmLibrarySchema = new Schema(
	{
		name: { type: String, required: true, trim: true },
		version: { type: String, required: true, trim: true },
		type: {
			type: String,
			trim: true,
			required: true,
		},
		description: { type: String, trim: true },
		npmUrl: { type: String, trim: true },
		githubUrl: { type: String, trim: true },
		website: {
			type: String,
			trim: true,
		},
		demoUrl: {
			type: String,
			trim: true,
		},
		documentationUrl: {
			type: String,
			trim: true,
		},

		weeklyDownloads: { type: String },
		packageSize: String,
		author: String,
		installCommand: { type: String, trim: true, required: true },
		note: {
			type: String,
			trim: true,
		},
		isDeprecated: {
			type: Boolean,
			default: false,
		},
		usageFrequency: {
			type: String,
			enum: ['rare', 'occasional', 'frequent', 'standard'],
			default: 'occasional',
		},
		priorityLevel: {
			type: String,
			enum: ['low', 'medium', 'high', 'critical'],
			default: 'medium',
		},
		expertise: {
			type: String,
			enum: ['beginner', 'intermediate', 'advanced', 'expert'],
			default: 'intermediate',
		},
		status: { type: String, enum: ['active', 'deprecated', 'unmaintained'], default: 'active' },
		alternates: [
			{
				type: Schema.Types.ObjectId,
				ref: 'NpmLibrary',
			},
		],
		tags: [String],
	},
	{
		timestamps: true,
	}
);

const NpmLibraryModel = mongoose.model('NpmLibrary', NpmLibrarySchema);

export default NpmLibraryModel;
