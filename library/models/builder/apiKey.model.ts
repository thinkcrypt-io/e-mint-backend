import mongoose, { Schema } from 'mongoose';

/**
 * A key an AI client (Claude, ChatGPT, Cursor…) connects to the MCP endpoint
 * with. Only a sha256 of the secret is stored — the secret is shown once when
 * the key is made. A key acts as the admin who made it, and never with more
 * than that admin's role allows; `scopes` narrow it further.
 */
const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		// The first characters of the secret, shown so a key can be recognised.
		prefix: { type: String, required: true },
		hash: { type: String, required: true, unique: true, select: false },
		scopes: { type: [String], enum: ['read', 'build'], default: ['read', 'build'] },
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
		lastUsedAt: { type: Date },
		expiresAt: { type: Date },
		revokedAt: { type: Date },
	},
	{ timestamps: true, versionKey: false }
);

export default mongoose.model<any>('ApiKey', schema, 'apikeys');
