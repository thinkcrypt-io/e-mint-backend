import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import TenantUser, { TENANT_TOKEN_KIND } from '../../library/models/tenancy/tenantUser.model.js';
import Organization from '../../library/models/tenancy/organization.model.js';
import OrganizationMember from '../../library/models/tenancy/organizationMember.model.js';
import { REVOKED_CODE, sessionIdOf, tenantSessions } from '../../library/functions/sessions.function.js';
import { normalizePermissions } from '../../library/functions/tenantPermissions.function.js';

/**
 * Signs in a tenant user's request (docs/multi-tenancy WO-05). The token must
 * say `kind: 'tenant'` (an admin token never does), its session must not be
 * signed out, the user must be active, and — for every route that works inside
 * an organization — the token's `org` must be one the user is still an active
 * member of. Sets:
 *   req.user          the TenantUser (no password)
 *   req.sessionId
 *   req.organization  the Organization (when the token names one)
 *   req.member, req.role, req.permissions
 *
 * `tenantProtect` requires the organization; `tenantProtectAccount` lets a
 * token with no organization through (picking or creating one, accepting an
 * invitation, the account's own settings).
 */
const secret = () => process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542';

const make =
	(requireOrg: boolean) =>
	async (req: any, res: Response, next: NextFunction): Promise<Response | void> => {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith('Bearer')) return res.status(401).json({ message: 'Not authorized, no token' });
		try {
			const token: string = authHeader.split(' ')[1];
			const decoded = jwt.verify(token, secret()) as any;
			if (decoded?.kind !== TENANT_TOKEN_KIND) return res.status(401).json({ message: 'Not authorized, token failed' });

			const sid = sessionIdOf(decoded, token);
			if (await tenantSessions.isRevoked(sid))
				return res.status(401).json({ message: 'This session was signed out. Sign in again.', code: REVOKED_CODE });
			req.sessionId = sid;

			const user: any = await TenantUser.findById(decoded._id).select('-password');
			if (!user) return res.status(401).json({ message: 'User was not found' });
			if (user.isActive === false) return res.status(401).json({ message: 'This account has been deactivated.' });
			req.user = user;
			req.permissions = [];

			const orgId = decoded.org && mongoose.isValidObjectId(decoded.org) ? decoded.org : null;
			if (orgId) {
				const [organization, member]: any = await Promise.all([
					Organization.findById(orgId).lean(),
					OrganizationMember.findOne({ organization: orgId, user: user._id, status: 'active' }).populate('role').lean(),
				]);
				// Removed from it, or it was switched off: this token no longer works there.
				if (!organization || organization.isActive === false || !member)
					return res.status(401).json({ message: 'You no longer have access to this organization. Sign in again.', code: 'ORG_ACCESS_REVOKED' });
				req.organization = organization;
				req.member = member;
				req.role = member.role;
				// Today's keys only (WO-21): old data:* read as records:*, per-model keys dropped.
				req.permissions = normalizePermissions(member.role?.permissions || []);
			} else if (requireOrg) {
				return res.status(403).json({ message: 'Choose or create an organization first.', code: 'NO_ORGANIZATION' });
			}

			tenantSessions.touchSession(req, user._id, sid);
			next();
		} catch (e: any) {
			return res.status(401).json({ message: 'Not authorized, token failed' });
		}
	};

export const tenantProtect = make(true);
export const tenantProtectAccount = make(false);
export default tenantProtect;

/**
 * The signed-in tenant user, if the request carries a valid session — or null,
 * never an error. For pages anyone can open that do more for a signed-in
 * account (an invitation link accepted in one click, WO-24).
 */
export const signedInTenantUser = async (req: any): Promise<any | null> => {
	const header = String(req.headers.authorization || '');
	if (!header.startsWith('Bearer ')) return null;
	try {
		const token = header.slice(7).trim();
		const decoded = jwt.verify(token, secret()) as any;
		if (decoded?.kind !== TENANT_TOKEN_KIND) return null;
		const sid = sessionIdOf(decoded, token);
		if (await tenantSessions.isRevoked(sid)) return null;
		const user: any = await TenantUser.findById(decoded._id);
		if (!user || user.isActive === false) return null;
		req.sessionId = sid;
		return user;
	} catch {
		return null;
	}
};
