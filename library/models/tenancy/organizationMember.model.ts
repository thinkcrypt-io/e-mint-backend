import mongoose, { Schema } from 'mongoose';

/**
 * A tenant user's place in an organization, with its role and the projects
 * they can open. A removed member
 * keeps the row (status 'removed') so history still names them; tenantProtect
 * refuses a token whose membership isn't active.
 */
const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
		user: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true, index: true },
		role: { type: Schema.Types.ObjectId, ref: 'OrganizationRole', required: true },
		status: { type: String, enum: ['active', 'removed'], default: 'active' },
		/**
		 * Which projects they can open (WO-22): every one, or only `projects`.
		 * Owner and Admin (`*`) always open every project, whatever this says.
		 */
		allProjects: { type: Boolean, default: true },
		projects: { type: [{ type: Schema.Types.ObjectId, ref: 'TenantProject' }], default: undefined },
		invitedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		joinedAt: { type: Date, default: Date.now },
		removedAt: { type: Date },
	},
	{ timestamps: true }
);
schema.index({ organization: 1, user: 1 }, { unique: true });

export default mongoose.model<any>('OrganizationMember', schema, 'organizationmembers');
