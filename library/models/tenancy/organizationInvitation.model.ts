import mongoose, { Schema } from 'mongoose';

/**
 * An emailed invitation into an organization. Only a sha256 of the link's
 * token is stored. Accepting adds a membership — for an existing tenant user,
 * or for the account created on the accept page. With `project` it's an
 * invitation into that one project (WO-47).
 */
const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
		email: { type: String, required: true, trim: true, lowercase: true },
		name: { type: String, trim: true },
		role: { type: Schema.Types.ObjectId, ref: 'OrganizationRole', required: true },
		/** The project access the membership gets when it's accepted (WO-22). */
		allProjects: { type: Boolean, default: true },
		projects: { type: [{ type: Schema.Types.ObjectId, ref: 'TenantProject' }], default: undefined },
		/**
		 * Set for an invitation into one project (WO-47): accepting makes them a
		 * guest of the organization who opens this project with `role`.
		 */
		project: { type: Schema.Types.ObjectId, ref: 'TenantProject', default: null },
		tokenHash: { type: String, required: true, unique: true, select: false },
		invitedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		expiresAt: { type: Date, required: true },
		acceptedAt: { type: Date },
		acceptedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		cancelledAt: { type: Date },
		/** Declined by the person invited (WO-50) — also cancelled, so the link stops working. */
		declinedAt: { type: Date },
		lastSentAt: { type: Date },
	},
	{ timestamps: true }
);
schema.index({ organization: 1, email: 1 });

export default mongoose.model<any>('OrganizationInvitation', schema, 'organizationinvitations');
