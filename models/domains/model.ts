import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,

			trim: true,
		},
		note: {
			type: String,
			trim: true,
		},
		provider: {
			type: String,
			required: true,
		},
		providerUrl: {
			type: String,
			trim: true,
		},
		accountId: {
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
		purchaseDate: {
			type: Date,
			required: true,
		},
		expiryDate: {
			type: Date,
			required: true,
		},
		renewalDate: {
			type: Date,
			required: true,
		},
		renewalPrice: {
			type: Number,
			required: true,
		},
		purchasePrice: {
			type: Number,
			required: true,
		},
		autoRenew: {
			type: Boolean,
			default: false,
		},
		status: {
			type: String,
			enum: ['active', 'inactive', 'grace', 'expired'],
			default: 'active',
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
		slug: 'domain',
		prefix: 'DM',
		initialValue: 1,
		padding: 4,
	})
);

export default mongoose.model<any>('Domain', schema);
