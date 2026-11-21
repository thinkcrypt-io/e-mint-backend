import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

/**
 * A store's own staff login for the commerce panel (docs/commerce-panel, CP-01):
 * made by the project's managers in the tenant panel (Project → Panel admins),
 * signed in with a username (or their email) + password. One username is one
 * login of one project — usernames and emails are unique across all projects.
 *
 * Not a TenantUser: a panel admin belongs to no organization, never sees
 * another project and holds a fixed set of keys (PANEL_PERMISSIONS) — records,
 * couriers and email accounts; never building, automations or settings.
 * Their token says `kind: 'panel'` and names the project.
 */
export const PANEL_TOKEN_KIND = 'panel';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 120 },
		/**
		 * What they sign in with (PU-08), unique across all projects. Logins made
		 * before usernames got their email as their username (scripts/migratePanelUsernames.js).
		 */
		username: { type: String, trim: true, lowercase: true, maxlength: 120 },
		/** Optional since PU-08; when given, unique too, and it signs in as well. */
		email: { type: String, trim: true, lowercase: true },
		phone: { type: String, trim: true },
		image: { type: String, trim: true },
		password: { type: String, minlength: 8, maxlength: 1024, select: false },
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
		project: { type: Schema.Types.ObjectId, ref: 'TenantProject', required: true, index: true },
		isActive: { type: Boolean, default: true },
		/**
		 * What they may do (docs/panel-users PU-01): a PanelRole of the project. A store
		 * login without one keeps the fixed store set (PANEL_PERMISSIONS).
		 */
		role: { type: Schema.Types.ObjectId, ref: 'PanelRole' },
		/** Every record and report of the project, and its panel users and roles — still never building (PU-02). */
		superAdmin: { type: Boolean, default: false },
		lastLoginAt: { type: Date },
		/** The tenant user who made the login. */
		createdBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		preferences: { type: Schema.Types.Mixed, default: {} },
		modalLayout: { type: String, enum: ['modal', 'drawer'], default: 'modal' },
		theme: { type: String, trim: true },
	},
	{ timestamps: true, minimize: false }
);

// Unique only where set: a login may have no email (PU-08). The migration swaps the old email_1 index for these.
schema.index({ username: 1 }, { unique: true, name: 'username_unique', partialFilterExpression: { username: { $type: 'string' } } });
schema.index({ email: 1 }, { unique: true, name: 'email_unique', partialFilterExpression: { email: { $type: 'string' } } });

schema.pre<any>('save', async function (next) {
	if (!this.isModified('password') || !this.password) return next();
	this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(10));
	next();
});

schema.methods.checkPassword = function (this: any, password: string) {
	return !!this.password && bcrypt.compare(String(password || ''), this.password);
};

/** The token for the commerce panel. Issue through tenantSessions.issueSession: `sid` names the session. */
schema.methods.generateAuthToken = function (this: any, sid?: string, org?: any): string {
	return jwt.sign(
		{
			_id: this._id,
			kind: PANEL_TOKEN_KIND,
			name: this.name,
			email: this.email,
			org: String(org || this.organization),
			project: String(this.project),
			...(sid && { sid }),
		},
		process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542'
	);
};

export default mongoose.model<any>('PanelAdmin', schema, 'paneladmins');
