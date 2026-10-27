import express from 'express';
import { handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { commerceView, saveCommerce } from '../library/functions/commerce/settings.js';
import { afterSettingsSaved, settingsGuard, startSetup } from '../library/functions/commerce/install.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';

/**
 * /tenant/api/p/:projectId/commerce — an e-commerce project's store
 * (docs/ecommerce). Only e-commerce projects have one.
 *
 *   GET  /settings      the wizard's answers, status, what the country offers, what each step still needs   any member
 *   PUT  /settings      { answers: { <section>: … }, step? } — each section checked; 400 with problems by section;
 *                       409 commerce_in_use when a built store can't take it   manage-projects
 *   POST /setup         builds the store from the answers in the background (status building → ready | failed)   manage-projects
 */
const router = express.Router({ mergeParams: true });
const manage = tenantPermissions(['manage-projects']);

router.use((req: any, res: any, next: any) =>
	req.project?.type === 'ecommerce' ? next() : res.status(404).json({ message: 'Only e-commerce projects have a store' })
);

router.get(
	'/settings',
	handle(async (req: any) => commerceView(req.project))
);

router.put(
	'/settings',
	manage,
	handle(async (req: any) => {
		await saveCommerce(req.project, req.body || {}, settingsGuard);
		await afterSettingsSaved(req.project);
		const view = await commerceView(req.project);
		const sections = Object.keys(req.body?.answers || {});
		if (sections.length)
			recordProjectEvent({
				req,
				model: 'Store',
				modelPath: 'store',
				document: req.project._id,
				name: 'Store settings',
				text: `changed the store settings (${sections.join(', ')})`,
			});
		return view;
	})
);

router.post(
	'/setup',
	manage,
	handle(async (req: any, res: any) => {
		const view = await startSetup(req, req.project);
		res.status(202);
		return view;
	})
);

export default router;
