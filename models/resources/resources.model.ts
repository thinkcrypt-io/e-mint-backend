import mongoose, { Schema } from 'mongoose';
import { REGEX } from '../../imports.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,
			trim: true,
		},
		icon: {
			type: String,
		},
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
		},

		description: {
			type: String,
			trim: true,
		},
		category: {
			type: String,
			required: true,
			trim: true,
		},
		url: {
			type: String,
			trim: true,
			match: REGEX.URL,
		},
		type: {
			type: String,
			enum: [
				'website',
				'artice',
				'documentation',
				'inspiration',
				'resource',
				'tutorial',
				'video',
				'git-repo',
				'internal-doc',
				'mockup',
				'audio',
				'podcast',
				'blog',
				'book',
				'other',
			],
		},
		attachment: String,
		note: String,
		tags: [String],
		priority: {
			type: String,
			enum: ['low', 'medium', 'high', 'highest'],
			default: 'medium',
		},
		status: {
			type: String,
			enum: ['active', 'archived', 'depricated'],
		},
		isRecommended: {
			type: Boolean,
			default: false, // Mark important resources
		},
		focus: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
	}
);

const Resource = mongoose.model<any>('Resource', schema);
export default Resource;
