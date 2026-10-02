import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

/**
 * A person signed up to the tenant platform (docs/multi-tenancy, D1) — never
 * an `Admin`. Belongs to organizations through OrganizationMember; the token
 * names the active one (`org` claim) and carries `kind: 'tenant'`, which
 * adminProtect refuses and tenantProtect requires.
 *
 * The two-factor fields mirror `Admin`'s so the shared two-factor service
 * (library/controllers/twoFactor) works on either.
 */
export const TENANT_TOKEN_KIND = 'tenant';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 120 },
		email: { type: String, required: true, unique: true, trim: true, lowercase: true },
		phone: { type: String, trim: true },
		image: { type: String, trim: true },
		password: { type: String, minlength: 8, maxlength: 1024, select: false },
		isActive: { type: Boolean, default: true },
		/**
		 * The account has proven it reads this email (WO-24): an emailed
		 * invitation or reset link was used, or a verification code was typed.
		 * Invitations show up in the app only for a verified email.
		 */
		emailVerified: { type: Boolean, default: false },
		emailVerifyCode: { type: String, select: false },
		emailVerifyExpires: { type: Date, select: false },
		emailVerifyAttempts: { type: Number, select: false },

		resetPasswordToken: { type: String, select: false },
		resetPasswordExpires: { type: Date, select: false },

		twoFactorEnabled: { type: Boolean, default: false },
		twoFactorEmail: { type: Boolean, default: true },
		twoFactorBackupCodes: {
			type: [{ _id: false, hash: String, usedAt: Date }],
			select: false,
			default: undefined,
		},
		twoFactorUpdatedAt: { type: Date },

		/** The organization a fresh sign-in opens. */
		lastOrganization: { type: Schema.Types.ObjectId, ref: 'Organization' },
		/** Table column choices per route, like Admin.preferences (free keys). */
		preferences: { type: Schema.Types.Mixed, default: {} },
		modalLayout: { type: String, enum: ['modal', 'drawer'], default: 'modal' },
		theme: { type: String, trim: true },
	},
	{ timestamps: true, minimize: false }
);

schema.pre<any>('save', async function (next) {
	// An invited person's account is made with no password until they set one.
	if (!this.isModified('password') || !this.password) return next();
	this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(10));
	next();
});

schema.methods.checkPassword = function (this: any, password: string) {
	return !!this.password && bcrypt.compare(String(password || ''), this.password);
};

/**
 * The login token for one organization. Use issueTenantSession (sessions)
 * rather than calling this directly: `sid` names the TenantSession.
 */
schema.methods.generateAuthToken = function (this: any, sid?: string, org?: any): string {
	return jwt.sign(
		{
			_id: this._id,
			kind: TENANT_TOKEN_KIND,
			name: this.name,
			email: this.email,
			...(org && { org: String(org) }),
			...(sid && { sid }),
		},
		process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542'
	);
};

export default mongoose.model<any>('TenantUser', schema, 'tenantusers');
