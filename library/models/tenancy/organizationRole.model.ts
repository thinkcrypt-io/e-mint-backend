import mongoose, { Schema } from 'mongoose';

/**
 * A role inside one organization. `permissions` use the admin panel's keys
 * (`view-<route>`, `create-<route>`, `edit-<route>`, `delete-<route>`, plus
 * the org keys in library/functions/tenantPermissions.function.ts); `'*'` is
 * everything. The three system roles are seeded per organization and can't be
 * deleted: owner (`*`), admin (`*` minus owner-only keys), member.
 */
export const SYSTEM_ROLES = ['owner', 'admin', 'member'] as const;

const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
		name: { type: String, required: true, trim: true, maxlength: 60 },
		description: { type: String, trim: true, maxlength: 300 },
		permissions: { type: [String], default: [] },
		system: { type: String, enum: [...SYSTEM_ROLES, null], default: null },
	},
	{ timestamps: true }
);
schema.index({ organization: 1, name: 1 }, { unique: true });

export default mongoose.model<any>('OrganizationRole', schema, 'organizationroles');
