import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A tenant project's own end user — someone signed up on the tenant's site or
 * app through the public API or the login widget (docs/multi-tenancy WO-11).
 * Never a TenantUser or an Admin: a customer of one project means nothing to
 * another. Scoped like the builder's documents (organization + project).
 *
 * Tokens: `{ _id, kind: 'customer', project, v }`, 30 days. `tokenVersion`
 * (`v`) signs every device out when bumped (password change, "sign out
 * everywhere", the tenant deactivating them).
 */
export const CUSTOMER_TOKEN_KIND = 'customer';
export const CUSTOMER_TOKEN_TTL = '30d';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 120 },
		email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
		phone: { type: String, trim: true, maxlength: 40 },
		password: { type: String, minlength: 8, maxlength: 1024, select: false },
		isActive: { type: Boolean, default: true },
		tokenVersion: { type: Number, default: 0 },
		lastLoginAt: { type: Date },
	},
	{ timestamps: true }
);

schema.plugin(tenantScoped);
// One account per email in a project.
schema.index({ organization: 1, project: 1, email: 1 }, { unique: true });

schema.pre<any>('save', async function (next) {
	if (!this.isModified('password') || !this.password) return next();
	this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(10));
	next();
});

schema.methods.checkPassword = function (this: any, password: string) {
	return !!this.password && bcrypt.compare(String(password || ''), this.password);
};

schema.methods.generateToken = function (this: any) {
	return jwt.sign(
		{ _id: this._id, kind: CUSTOMER_TOKEN_KIND, project: String(this.project), v: this.tokenVersion || 0 },
		process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542',
		{ expiresIn: CUSTOMER_TOKEN_TTL }
	);
};

export default mongoose.model<any>('ProjectCustomer', schema, 'projectcustomers');
