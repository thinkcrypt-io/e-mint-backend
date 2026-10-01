import adminProtect from '../admin/protect.admin.middleware.js';
import adminPermissions from '../admin/adminPermissions.middleware.js';
import { currentScope } from '../../library/functions/tenantScope.function.js';
import { tenantPermissions } from '../../library/functions/tenantPermissions.function.js';

/**
 * Guards for routers the admin API and a tenant project share (uploads, the
 * media manager — docs/multi-tenancy WO-09). Outside a tenant scope they are
 * exactly adminProtect / adminPermissions. Inside one — which only the project
 * router sets, after tenantProtect has signed the request in and checked the
 * project — the request is already authenticated, and permissions are the
 * organization role's. A client can't put itself in a scope: it's set
 * server-side in AsyncLocalStorage, not read from the request.
 */
export const adminOrTenantProtect = (req: any, res: any, next: any) =>
	currentScope() && req.user && req.organization ? next() : adminProtect(req, res, next);

export const adminOrTenantPermissions = (permissions: string[]) => (req: any, res: any, next: any) =>
	currentScope() ? tenantPermissions(permissions)(req, res, next) : adminPermissions(permissions)(req, res, next);

/** A route only the super-admin panel has (S3-wide actions, billing, signatures). */
export const adminOnlyRoute = (_req: any, res: any, next: any) =>
	currentScope() ? res.status(404).json({ message: 'Not found' }) : next();
