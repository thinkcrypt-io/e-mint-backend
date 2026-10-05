import express from 'express';
import { tenantProtect } from '../middleware/tenant/protect.tenant.middleware.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { handle, TenancyError } from '../library/functions/tenancy.function.js';
import { PROJECT_TYPES } from '../library/models/tenancy/tenantProject.model.js';
import { templateCards } from './templates.router.js';

/**
 * /tenant/api/templates — the template gallery in New project (docs/templates
 * T-14), before there's a project: the published templates of a kind this
 * organization may use, as the same cards Get started shows. Choosing one only
 * picks it — the new project's Get started asks its questions and builds it
 * (POST /p/:id/templates/:key/apply). Needs `create-projects`.
 *
 *   GET /?type=app|api|website   { doc: [{ key, name, summary, icon, version, inside, questions }] }
 */
const router = express.Router();
router.use(tenantProtect, tenantPermissions(['create-projects']));

router.get(
	'/',
	handle(async (req: any) => {
		const type = String(req.query.type || 'app');
		if (!(PROJECT_TYPES as readonly string[]).includes(type)) throw new TenancyError(400, `A project's kind is one of: ${PROJECT_TYPES.join(', ')}`);
		return { doc: await templateCards(type, req.organization._id) };
	})
);

export default router;
