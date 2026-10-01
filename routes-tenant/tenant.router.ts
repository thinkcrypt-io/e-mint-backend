import express from 'express';
import authRouter from './auth/auth.router.js';
import orgRouter, { invitationsRouter } from './org/org.router.js';
import projectsRouter from './projects/projects.router.js';
import projectRouter from './project.router.js';

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
router.use('/p/:projectId', projectRouter);

export default router;
