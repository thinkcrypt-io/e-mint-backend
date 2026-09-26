import express from 'express';
import { adminProtect, adminPermissions } from '../../../middleware/index.js';
import { getDashboard, resetDashboard, saveDashboard } from './dashboard.controller.js';

/**
 * /admin/api/dashboard — the dashboard's widgets. Every signed-in admin reads
 * them (each widget's data is then fetched under their own permissions);
 * changing them is the builder's power.
 */
const router = express.Router();

router.get('/', adminProtect, getDashboard);
router.put('/', adminProtect, adminPermissions(['edit-builder']), saveDashboard);
router.delete('/', adminProtect, adminPermissions(['edit-builder']), resetDashboard);

export default router;
