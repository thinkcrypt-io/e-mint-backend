import express from 'express';
import { handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { checkStripe, listPayments, paymentSettingsView, savePaymentSettings } from '../library/functions/payments.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { apiOrigin } from '../library/controllers/mcp/website.tools.js';

/**
 * /tenant/api/p/:projectId/payments — the project's payments (docs/widgets
 * W-06): its own merchant accounts, and every payment checkout made.
 *
 *   GET  /                     the last 100 payments                     records:view
 *   GET  /settings             providers (keys only as set / not set), offered by country, webhook URL   manage-projects
 *   PUT  /settings             { stripe?: { enabled, mode, publishableKey, secretKey?, webhookSecret? }, successUrl?, cancelUrl? }
 *   POST /settings/check       asks Stripe whether the secret key works
 */
const router = express.Router({ mergeParams: true });
const manage = tenantPermissions(['manage-projects']);

router.get(
	'/',
	tenantPermissions(['records:view']),
	handle(async (req: any) => ({ doc: await listPayments(req.project) }))
);

router.get(
	'/settings',
	manage,
	handle(async (req: any) => paymentSettingsView(req.project, apiOrigin(req)))
);

router.put(
	'/settings',
	manage,
	handle(async (req: any) => {
		await savePaymentSettings(req.project, req.body || {});
		recordProjectEvent({
			req,
			model: 'Payments',
			modelPath: 'payments',
			document: req.project._id,
			name: 'Payments',
			text: `changed the payment settings${req.body?.stripe ? ` (Stripe ${req.body.stripe.enabled ? 'on' : 'off'}, ${req.body.stripe.mode === 'live' ? 'live' : 'test'})` : ''}`,
		});
		return paymentSettingsView(req.project, apiOrigin(req));
	})
);

router.post(
	'/settings/check',
	manage,
	handle(async (req: any) => checkStripe(req.project))
);

export default router;
