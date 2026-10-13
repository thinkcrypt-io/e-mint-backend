import express from 'express';
import authRouter from './auth/auth.router.js';
import orgRouter, { invitationsRouter } from './org/org.router.js';
import projectsRouter from './projects/projects.router.js';
import projectRouter from './project.router.js';
import notificationsRouter from './notifications.router.js';
import templatesGalleryRouter from './templatesGallery.router.js';
import { tenantProtect } from '../middleware/tenant/protect.tenant.middleware.js';
import { tenantNav } from '../library/functions/tenantNav.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { runInScope } from '../library/functions/tenantScope.function.js';
import { uploadRoute, mediaRoute } from '../routes-admin/index.js';

/**
 * /tenant/api — the tenant platform's API (docs/multi-tenancy, README §3).
 * Account and organization routes live here; everything inside a project is
 * under /tenant/api/p/:projectId (project.router.ts).
 */
const router = express.Router();

router.use('/auth', authRouter);
router.use('/org', orgRouter);
router.use('/invitations', invitationsRouter);
router.use('/projects', projectsRouter);
// New project's template gallery, before there's a project (docs/templates T-14).
router.use('/templates', templatesGalleryRouter);
// The signed-in person's notifications, every organization's (WO-37).
router.use('/notifications', notificationsRouter);
router.use('/p/:projectId', projectRouter);

// The organization's own files before a project is chosen — its logo
// (docs/pdf-templates D18): the shared library, `{ organization, project: null }`.
const orgFiles = [
	tenantProtect,
	tenantPermissions(['manage-organization']),
	(req: any, _res: any, next: any) => runInScope({ organization: req.organization._id }, () => next()),
];
router.use('/upload', ...orgFiles, uploadRoute);
router.use('/media', ...orgFiles, mediaRoute);

// Before a project is chosen: Home and the organization's pages.
router.get('/sidebar/:platform/:type', tenantProtect, (req: any, res: any) =>
	res.status(200).json([
		{ title: 'Home', href: '/', icon: 'house', path: 'dashboard' },
		...tenantNav(req.permissions || [], { inProject: false, guest: !!req.member?.guest }),
	])
);

export default router;
