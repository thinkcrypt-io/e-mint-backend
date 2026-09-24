import express from 'express';
import { adminProtect, adminPermissions } from '../../../middleware/index.js';
import {
	getBuilderRoutes,
	getBuilderRoute,
	saveBuilderDraft,
	discardBuilderDraft,
	publishBuilderRoute,
	resetBuilderRoute,
	getBuilderVersions,
	restoreBuilderVersion,
	getBuilderModelFields,
	getBuilderState,
	setBuilderState,
	setBuilderSource,
	compareBuilderRoute,
} from './builder.controller.js';
import {
	listModels,
	getModelOptions,
	checkModelName,
	getModel,
	createModel,
	previewModel,
	updateModel,
	deleteModel,
} from './models.controller.js';
import { syncDynamicModels } from '../../functions/dynamicModels.function.js';
import { aiBuildModel } from './ai.controller.js';

/**
 * /admin/api/builder — the route builder's API.
 *
 * Its own permission, not the 'models' one the older config pages share:
 * publishing settings changes what the admin API accepts and returns, which
 * is a bigger power than editing a table's columns. A role with '*' has both.
 */
const router = express.Router();

const view = [adminProtect, adminPermissions(['view-builder'])];
const edit = [adminProtect, adminPermissions(['edit-builder'])];

// Built models come and go at runtime; make sure this process has them before
// any route is looked up.
router.use(async (req: any, res: any, next: any) => {
	try {
		await syncDynamicModels({ app: req.app });
		next();
	} catch (e) {
		next(e);
	}
});

// The model builder. Registered before '/model/:name' only for readability —
// the paths don't overlap.
router.get('/models', ...view, listModels);
router.get('/models/options', ...view, getModelOptions);
router.get('/models/check', ...view, checkModelName);
router.get('/models/:id', ...view, getModel);
router.post('/models/preview', ...edit, previewModel);
// A draft from a description, by Claude — nothing is saved (ai.controller.ts).
router.post('/models/ai', ...edit, aiBuildModel);
router.post('/models', ...edit, createModel);
router.put('/models/:id', ...edit, updateModel);
router.delete('/models/:id', ...edit, deleteModel);

router.get('/routes', ...view, getBuilderRoutes);
router.get('/route', ...view, getBuilderRoute);
router.get('/versions', ...view, getBuilderVersions);
router.get('/model/:name', ...view, getBuilderModelFields);
router.get('/state', ...view, getBuilderState);
router.get('/compare', ...view, compareBuilderRoute);

router.put('/draft', ...edit, saveBuilderDraft);
router.delete('/draft', ...edit, discardBuilderDraft);
router.post('/publish', ...edit, publishBuilderRoute);
router.post('/reset', ...edit, resetBuilderRoute);
router.post('/restore', ...edit, restoreBuilderVersion);
router.put('/state', ...edit, setBuilderState);
router.put('/source', ...edit, setBuilderSource);

export default router;
