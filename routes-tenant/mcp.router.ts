import { Request } from 'express';
import ApiKey from '../library/models/builder/apiKey.model.js';
import TenantUser from '../library/models/tenancy/tenantUser.model.js';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import Organization from '../library/models/tenancy/organization.model.js';
import OrganizationMember from '../library/models/tenancy/organizationMember.model.js';
import { runUnscoped } from '../library/functions/tenantScope.function.js';
import { grants, normalizePermissions } from '../library/functions/tenantPermissions.function.js';
import { canOpenProject } from '../library/functions/tenancy.function.js';
import { makeMcpRouter, hashKey, Caller } from '../library/controllers/mcp/mcp.router.js';

/**
 * /tenant/mcp — a tenant project's MCP endpoint (docs/multi-tenancy WO-10).
 *
 * The same tools as the admins' /mcp, answered inside one project: a key made
 * in the project's "Connect AI" page (/tenant/api/p/:id/builder/api-keys)
 * carries its organization and project, and acts as the member who made it,
 * never beyond their organization role — `build` to read and build,
 * `records:view` (WO-21) to read records. Whatever the AI builds lands in that
 * project.
 *
 *   Authorization: Bearer emk_…   or   /tenant/mcp/emk_…
 */

const tenantUrl = (path = '') => `${String(process.env.TENANT_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '')}${path}`;

const authenticate = async (req: Request): Promise<Caller | { error: string }> => {
	const header = String(req.headers.authorization || '');
	const secret = (req.params as any).key || (header.startsWith('Bearer ') ? header.slice(7).trim() : '');
	if (!secret || !secret.startsWith('emk_')) return { error: 'A project API key is required (the project’s Connect AI page)' };
	// Keys are tenant-scoped documents: looked up across scopes, then held to their own.
	const key: any = await runUnscoped(() => ApiKey.findOne({ hash: hashKey(secret) }).lean());
	if (!key || key.revokedAt || !key.organization || !key.project) return { error: 'This API key was revoked or doesn’t exist' };
	if (key.expiresAt && new Date(key.expiresAt) < new Date()) return { error: 'This API key has expired' };

	const [user, organization, project, member]: any = await Promise.all([
		TenantUser.findById(key.createdBy).select('-password').lean(),
		Organization.findById(key.organization).lean(),
		TenantProject.findOne({ _id: key.project, organization: key.organization }).lean(),
		OrganizationMember.findOne({ organization: key.organization, user: key.createdBy, status: 'active' }).populate('role').lean(),
	]);
	if (!user || user.isActive === false || !member) return { error: 'The person who made this key no longer has access' };
	if (!organization || organization.isActive === false) return { error: 'This organization is switched off' };
	if (!project) return { error: 'This key’s project was deleted' };
	if (project.isActive === false) return { error: 'This key’s project is archived — restore it to build' };
	// Its maker's access to the project (WO-22) can be taken away after the key was made.
	const permissions: string[] = normalizePermissions(member.role?.permissions || []);
	if (!canOpenProject(member, permissions, project._id)) return { error: 'The person who made this key can no longer open this project' };

	if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > 60_000)
		await runUnscoped(() => ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }));

	return {
		user,
		permissions,
		key,
		page: route => tenantUrl(`/t/${route}`),
		link: path => tenantUrl(path),
		allows: p => grants(permissions, [p]),
		builder: () => grants(permissions, ['build']),
		scope: { organization: key.organization, project: key.project },
	};
};

export default makeMcpRouter(authenticate);
