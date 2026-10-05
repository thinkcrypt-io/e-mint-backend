import express from 'express';
import { handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { loadWidgets, saveWidgets, widgetCatalog } from '../library/functions/widgets.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { apiOrigin } from '../library/controllers/mcp/website.tools.js';

/**
 * /tenant/api/p/:projectId/widgets — the project's site widgets
 * (docs/widgets W-03): what each widget is and accepts, and the project's
 * settings. Changing them needs `build` (it changes what the live site shows).
 *
 *   GET /   { catalog, widgets, theme, script }   script: the tag to add once per page
 *   PUT /   { widgets?: { [name]: { enabled?, options?, texts? } }, theme? }
 */
const router = express.Router({ mergeParams: true });
const build = tenantPermissions(['build']);

const view = (req: any, saved: any) => ({
	catalog: widgetCatalog(),
	...saved,
	script: `<script src="${apiOrigin(req)}/public/mint.js" data-project="${req.project.publicSlug}" async></script>`,
});

router.get(
	'/',
	build,
	handle(async (req: any) => view(req, await loadWidgets(req.project)))
);

router.put(
	'/',
	build,
	handle(async (req: any) => {
		const saved = await saveWidgets(req.project, req.body || {});
		const names = Object.keys(req.body?.widgets || {});
		recordProjectEvent({
			req,
			model: 'Widgets',
			modelPath: 'site-setup',
			document: req.project._id,
			name: 'Widgets',
			text: `changed the site widgets${names.length ? ` (${names.join(', ')})` : ''}${req.body?.theme ? ' and their look' : ''}`,
		});
		return view(req, saved);
	})
);

export default router;
