import { Request } from 'express';
import ApiKey from '../library/models/builder/apiKey.model.js';
import PanelAdmin from '../library/models/tenancy/panelAdmin.model.js';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import Organization from '../library/models/tenancy/organization.model.js';
import { runUnscoped } from '../library/functions/tenantScope.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { panelAccess } from '../library/functions/panelAdmin.function.js';
import { makeMcpRouter, hashKey, Caller } from '../library/controllers/mcp/mcp.router.js';

/**
 * /tenant/commerce-mcp (also /tenant/panel-mcp) — a panel login's own MCP endpoint
 * (docs/commerce-panel CP-07; any project's panel users, docs/panel-users PU-05).
 *
 * A key made in the commerce panel's Connect AI page (/tenant/api/panel/auth/mcp-keys)
 * acts as that store login, inside its one store, with its fixed keys
 * (PANEL_PERMISSIONS) — the store's records, stock, deliveries, buyer checks,
 * search insights and media (PANEL_TOOLS). Nothing that builds: no models,
 * pages, automations, endpoints, email designs or site changes. A tenant key
 * isn't accepted here, and a store login's key isn't accepted on /tenant/mcp.
 *
 *   Authorization: Bearer emk_…   or   /tenant/commerce-mcp/emk_…
 */

const commerceUrl = (path = '') => `${String(process.env.COMMERCE_FRONTEND_URL || 'https://commerce.mintapp.site').replace(/\/$/, '')}${path}`;
/** Any other project's panel users sign in at the panel app (docs/panel-users PU-03). */
const panelUrl = (path = '') => `${String(process.env.PANEL_FRONTEND_URL || 'https://panel.tcrypt.site').replace(/\/$/, '')}${path}`;

const authenticate = async (req: Request): Promise<Caller | { error: string }> => {
	const header = String(req.headers.authorization || '');
	const secret = (req.params as any).key || (header.startsWith('Bearer ') ? header.slice(7).trim() : '');
	if (!secret || !secret.startsWith('emk_')) return { error: 'A store key is required (the commerce panel’s Connect AI page)' };
	const key: any = await runUnscoped(() => ApiKey.findOne({ hash: hashKey(secret) }).lean());
	if (!key || key.revokedAt || !key.panelAdmin || !key.project) return { error: 'This key was revoked or doesn’t exist' };
	if (key.expiresAt && new Date(key.expiresAt) < new Date()) return { error: 'This key has expired' };

	const admin: any = await PanelAdmin.findById(key.panelAdmin).select('-password').lean();
	if (!admin || admin.isActive === false || String(admin.project) !== String(key.project)) return { error: 'The store login that made this key was switched off or removed' };
	const project: any = await TenantProject.findById(key.project).lean();
	if (!project || project.isActive === false) return { error: 'This project isn’t open any more' };
	const organization: any = await Organization.findById(project.organization).lean();
	if (!organization || organization.isActive === false) return { error: 'This store isn’t open any more' };

	if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > 60_000)
		await runUnscoped(() => ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }));

	// The login's own keys: a store's fixed set, its panel role's, or a super admin's (docs/panel-users).
	const { permissions } = await panelAccess(admin, project);
	const site = project.type === 'ecommerce' ? commerceUrl : panelUrl;
	return {
		user: admin,
		permissions,
		key,
		page: route => site(`/${project.publicSlug}/${route}`),
		link: path => site(`/${project.publicSlug}${path === '/' ? '' : path}`),
		allows: p => grants(permissions, [p]),
		builder: () => false,
		scope: { organization: project.organization, project: project._id },
		project,
		panel: true,
	};
};

export default makeMcpRouter(authenticate);
