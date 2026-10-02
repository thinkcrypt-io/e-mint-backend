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
	getBuilderBacklinks,
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
	updatePublicApi,
} from './models.controller.js';
import { syncDynamicModels } from '../../functions/dynamicModels.function.js';
import { aiBuildModel } from './ai.controller.js';
import {
	aiPlanFeature,
	buildFeaturePlan,
	checkFeaturePlan,
	createApiKey,
	getFeatureCatalog,
	listApiKeys,
	listFeatures,
	listStarters,
	buildStarter,
	revokeApiKey,
} from './features.controller.js';

/**
 * /admin/api/builder — the route builder's API.
 *
 * Its own permission, not the 'models' one the older config pages share:
 * publishing settings changes what the admin API accepts and returns, which
 * is a bigger power than editing a table's columns. A role with '*' has both.
 */
type Guards = {
	view: any[];
	edit: any[];
	/** MCP keys. */
	keys: any[];
	/**
	 * A tenant project's builder (docs/multi-tenancy WO-09): no "Build with AI"
	 * on the platform's key (D10) and no global/per-route source switches —
	 * a project's routes have no code files to switch to.
	 */
	tenant?: boolean;
};

const notForProjects = (_req: any, res: any) =>
	res.status(403).json({ message: 'Not available in projects — connect your own AI through MCP instead.' });

export const makeBuilderRouter = ({ view, edit, keys, tenant }: Guards) => {
	const router = express.Router();
	const platformOnly = tenant ? [notForProjects] : [];

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
	router.post('/models/ai', ...edit, ...platformOnly, aiBuildModel);
	router.post('/models', ...edit, createModel);
	router.put('/models/:id', ...edit, updateModel);
	router.delete('/models/:id', ...edit, deleteModel);
	// A tenant project model's public API (routes-public). 404 outside a project.
	router.put('/models/:id/public-api', ...edit, updatePublicApi);

	// Features: several models and their links, planned and built together (features.service.ts).
	router.get('/features', ...view, listFeatures);
	router.get('/features/catalog', ...view, getFeatureCatalog);
	router.post('/features/plan', ...edit, checkFeaturePlan);
	router.post('/features/ai', ...edit, ...platformOnly, aiPlanFeature);
	router.post('/features/build', ...edit, buildFeaturePlan);
	// Starter templates for a new project's Get started page (WO-35).
	router.get('/starters', ...view, listStarters);
	router.post('/starters/:key', ...edit, buildStarter);

	// Keys AI clients connect to /mcp with (library/controllers/mcp).
	router.get('/api-keys', ...keys, listApiKeys);
	router.post('/api-keys', ...keys, createApiKey);
	router.delete('/api-keys/:id', ...keys, revokeApiKey);

	router.get('/routes', ...view, getBuilderRoutes);
	router.get('/route', ...view, getBuilderRoute);
	router.get('/versions', ...view, getBuilderVersions);
	router.get('/model/:name', ...view, getBuilderModelFields);
	router.get('/backlinks/:name', ...view, getBuilderBacklinks);
	router.get('/state', ...view, getBuilderState);
	router.get('/compare', ...view, compareBuilderRoute);

	router.put('/draft', ...edit, saveBuilderDraft);
	router.delete('/draft', ...edit, discardBuilderDraft);
	router.post('/publish', ...edit, publishBuilderRoute);
	router.post('/reset', ...edit, resetBuilderRoute);
	router.post('/restore', ...edit, restoreBuilderVersion);
	router.put('/state', ...edit, ...platformOnly, setBuilderState);
	router.put('/source', ...edit, ...platformOnly, setBuilderSource);

	return router;
};

export default makeBuilderRouter({
	view: [adminProtect, adminPermissions(['view-builder'])],
	edit: [adminProtect, adminPermissions(['edit-builder'])],
	keys: [adminProtect, adminPermissions(['edit-builder'])],
});
