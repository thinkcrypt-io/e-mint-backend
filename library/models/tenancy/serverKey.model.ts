import crypto from 'crypto';
import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A secret server key of a project's public API (docs/api-builder D8): calls
 * endpoints whose "who" is a server key — from the business's own server,
 * scripts or partners, never from a website. Only the key's sha256 is kept;
 * the secret is shown once, when it's made. Scoped to the project.
 * (Not `ApiKey` — that's the MCP keys, library/models/builder/apiKey.model.ts.)
 */
export const SERVER_KEY_PREFIX = 'mint_sk_';

export const hashServerKey = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');
export const newServerKey = () => `${SERVER_KEY_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		hash: { type: String, required: true, unique: true, select: false },
		last4: { type: String, required: true },
		lastUsedAt: Date,
		revokedAt: { type: Date, default: null },
		createdBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		createdByName: { type: String, default: '' },
	},
	{ timestamps: true, versionKey: false }
);

schema.plugin(tenantScoped);

export default mongoose.model<any>('ServerKey', schema, 'serverkeys');
