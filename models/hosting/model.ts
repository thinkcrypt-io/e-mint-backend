import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib/index.js';

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
		accountEmail: {
			type: String,
			required: true,
			trim: true,
		},
		type: {
			type: String,
			enum: ['internal', 'client-owned', 'other'],
			required: true,
		},
		status: {
			type: String,
			enum: ['active', 'inactive', 'paused', 'archived'],
			default: 'active',
		},
		notes: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

schema.pre<any>(
	'save',
	addSequentialCodeMiddleware({
		slug: 'blog',
		prefix: 'HST',
		initialValue: 1,
		padding: 4,
	})
);

export default mongoose.model<any>('Hosting', schema);
