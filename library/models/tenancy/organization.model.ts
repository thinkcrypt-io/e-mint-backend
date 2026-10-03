import mongoose, { Schema } from 'mongoose';

/**
 * A tenant: a customer company on the platform (docs/multi-tenancy, D2).
 * Everything a tenant builds carries its id. `onboarding` holds the answers
 * given at sign-up — about the business and how they heard of us.
 */
export const ORG_INDUSTRIES = [
	'agency',
	'ecommerce',
	'education',
	'finance',
	'healthcare',
	'hospitality',
	'manufacturing',
	'media',
	'nonprofit',
	'real-estate',
	'retail',
	'software',
	'travel',
	'other',
];
export const ORG_TEAM_SIZES = ['1', '2-10', '11-50', '51-200', '201-1000', '1000+'];
export const HEARD_FROM = ['search', 'social', 'friend', 'youtube', 'blog', 'event', 'ad', 'ai-assistant', 'other'];
export const ORG_GOALS = ['website', 'internal-tools', 'crm', 'ecommerce', 'api', 'automation', 'other'];

const onboardingSchema = new Schema<any>(
	{
		businessName: { type: String, trim: true, maxlength: 160 },
		industry: { type: String, enum: [...ORG_INDUSTRIES, null] },
		teamSize: { type: String, enum: [...ORG_TEAM_SIZES, null] },
		role: { type: String, trim: true, maxlength: 80 },
		website: { type: String, trim: true, maxlength: 300 },
		country: { type: String, trim: true, maxlength: 80 },
		heardFrom: { type: String, enum: [...HEARD_FROM, null] },
		heardFromOther: { type: String, trim: true, maxlength: 200 },
		goals: { type: [String], enum: ORG_GOALS, default: undefined },
		completedAt: { type: Date },
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 120 },
		slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
		owner: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true, index: true },
		logo: { type: String, trim: true },
		isActive: { type: Boolean, default: true },
		/** The platform's own organization (docs/templates T-04: template previews) — hidden from oversight and sign-in. */
		system: { type: Boolean, default: undefined },
		plan: { type: String, default: 'free', trim: true },
		onboarding: { type: onboardingSchema, default: {} },
	},
	{ timestamps: true, minimize: false }
);

export default mongoose.model<any>('Organization', schema, 'organizations');
