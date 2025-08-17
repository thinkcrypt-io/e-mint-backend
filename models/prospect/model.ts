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
		},
		client: {
			type: Schema.Types.ObjectId,
			ref: 'Client',
		},
		clientLocation: {
			type: String,
			trim: true,
		},
		status: {
			type: String,
			enum: [
				'lead',
				'qualified',
				'proposal_sent',
				'negotiation',
				'in_progress',
				'on_hold',
				'closed_won',
				'closed_lost',
			],
			default: 'lead',
		},
		category: {
			type: String,
			enum: ['app', 'crm', 'custom_software', 'ecommerce', 'erp', 'mvp', 'website', 'other'],
			default: 'other',
		},
		estimatedValue: {
			type: Number,
			default: 0,
		},
		agreedValue: {
			type: Number,
			default: 0,
		},
		currency: {
			type: String,
			enum: ['BDT', 'USD', 'EUR', 'GBP', 'OTHER'],
			default: 'BDT',
		},
		estimatedStartDate: {
			type: Date,
		},
		timeline: {
			type: String,
		},
		description: {
			type: String,
			trim: true,
		},
		riskLevel: {
			type: String,
			enum: ['low', 'medium', 'high'],
			default: 'low',
		},
		closedReason: {
			type: String, // why deal was lost (if closed_lost)
		},
		priority: {
			type: Number,
			default: 0,
		},
		tags: [String],
		note: {
			type: String,
			trim: true,
		},
		document: {
			type: String,
			trim: true,
		},
		source: {
			type: String,
			enum: [
				'referral',
				'website',
				'linkedin',
				'event',
				'cold_email',
				'partner',
				'social_media',
				'other',
			],
			default: 'other',
		},
		requirements: {
			type: String,
			trim: true,
		},
		quotation: {
			type: String,
			trim: true,
		},
		lastInteractionDate: {
			type: Date,
		},
		interactionSummary: {
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
		slug: 'prospect',
		prefix: 'PRP',
		initialValue: 0,
		padding: 4,
	})
);

export default mongoose.model<any>('Prospect', schema);
