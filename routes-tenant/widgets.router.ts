import { ensureProjectKey } from '../library/functions/projectKey.function.js';
import express from 'express';
import { handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { forgetPublicWidgets, loadWidgets, saveWidgets, widgetCatalog } from '../library/functions/widgets.function.js';
import { saveShop, shopView } from '../library/functions/shop.function.js';
import { authView, saveAuth } from '../library/functions/authMapping.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { apiOrigin } from '../library/controllers/mcp/website.tools.js';

/**
 * /tenant/api/p/:projectId/widgets — the project's site widgets
 * (docs/widgets W-03): what each widget is and accepts, and the project's
 * settings. Changing them needs `build` (it changes what the live site shows).
 *
 *   GET /   { catalog, widgets, theme, script }   script: the tag to add once per page
 *   PUT /   { widgets?: { [name]: { added?, enabled?, options?, texts? } }, theme? }
 *           added: true puts a widget on the project's Widgets screen (W-24, the
 *           setup wizard); added: false removes it (back to its defaults, off)
 *   GET /shop   { shop, saved, problem, guess, models }   the shop (W-05): which model is the
 *               catalogue and what its fields mean; `guess` from the models' names
 *   PUT /shop   { shop: ShopMapping | null }   null clears it (and switches the cart off)
 *   GET /auth   { auth, saved, problem, guess, models }   Login & account's customer model (W-24)
 *   PUT /auth   { auth: { model, fields: { email, name?, phone? } } | null }   null: MINT's Customers only
 */
const router = express.Router({ mergeParams: true });
const build = tenantPermissions(['build']);

// The project key names the project to mint.js (docs/api-builder D14).
const view = async (req: any, saved: any) => ({
	catalog: widgetCatalog(),
	...saved,
	script: `<script src="${apiOrigin(req)}/public/mint.js" data-key="${await ensureProjectKey(req.project)}" async></script>`,
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
		const before = await loadWidgets(req.project);
		const saved = await saveWidgets(req.project, req.body || {});
		const names = Object.keys(req.body?.widgets || {});
		const title = (n: string) => saved.widgets[n] && (widgetCatalog().find(t => t.name === n)?.title || n);
		const added = names.filter(n => saved.widgets[n]?.added && !before.widgets[n]?.added).map(title);
		const removed = names.filter(n => !saved.widgets[n]?.added && before.widgets[n]?.added).map(title);
		const changed = names.filter(n => saved.widgets[n]?.added && before.widgets[n]?.added);
		recordProjectEvent({
			req,
			model: 'Widgets',
			modelPath: 'site-setup',
			document: req.project._id,
			name: 'Widgets',
			text: [
				added.length && `added the ${added.join(', ')} widget${added.length > 1 ? 's' : ''}`,
				removed.length && `removed the ${removed.join(', ')} widget${removed.length > 1 ? 's' : ''}`,
				(changed.length || (!added.length && !removed.length && !req.body?.theme)) && `changed the site widgets${changed.length ? ` (${changed.join(', ')})` : ''}`,
				req.body?.theme && 'changed their look',
			]
				.filter(Boolean)
				.join(' and '),
		});
		return view(req, saved);
	})
);

router.get(
	'/shop',
	build,
	handle(async (req: any) => shopView(req.project))
);

router.put(
	'/shop',
	build,
	handle(async (req: any) => {
		const view = await saveShop(req.project, req.body || {});
		forgetPublicWidgets(req.project);
		recordProjectEvent({
			req,
			model: 'Widgets',
			modelPath: 'site-setup',
			document: req.project._id,
			name: 'Shop',
			text: req.body?.shop === null ? 'cleared the shop set-up (the cart is off)' : `set up the shop (products from ${view.shop?.product.model})`,
		});
		return view;
	})
);

router.get(
	'/auth',
	build,
	handle(async (req: any) => authView(req.project))
);

router.put(
	'/auth',
	build,
	handle(async (req: any) => {
		const view = await saveAuth(req.project, req.body || {});
		recordProjectEvent({
			req,
			model: 'Widgets',
			modelPath: 'site-setup',
			document: req.project._id,
			name: 'Login & account',
			text: view.auth
				? `set the customer model to ${view.models.find(m => m.name === view.auth!.model)?.title || view.auth.model}`
				: 'set customers to be kept in MINT’s Customers only',
		});
		return view;
	})
);

export default router;
