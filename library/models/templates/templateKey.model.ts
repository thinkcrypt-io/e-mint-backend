import mongoose, { Schema } from 'mongoose';

/**
 * A key Claude (or any MCP client) connects to the Templates MCP with
 * (`/templates/mcp`, docs/templates TD9). Separate from the builder's
 * `ApiKey`: a template key can only read and write template blueprints, and an
 * `emk_` builder key can't reach templates. Only a sha256 of the secret
 * (`emt_…`) is stored; it acts as the admin who made it, never beyond their
 * role, and its scopes narrow it further.
 */
export const TEMPLATE_KEY_SCOPES = ['read', 'write', 'preview', 'publish'] as const;

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		prefix: { type: String, required: true },
		hash: { type: String, required: true, unique: true, select: false },
		scopes: { type: [String], enum: TEMPLATE_KEY_SCOPES, default: ['read', 'write', 'preview'] },
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
		lastUsedAt: { type: Date },
		expiresAt: { type: Date },
		revokedAt: { type: Date },
	},
	{ timestamps: true, versionKey: false }
);

export default mongoose.model<any>('TemplateKey', schema, 'templatekeys');
