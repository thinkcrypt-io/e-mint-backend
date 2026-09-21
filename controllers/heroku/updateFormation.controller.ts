import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { updateFormation, invalidate } from '../../lib/heroku/index.js';

/**
 * PATCH /:id/apps/:app/formation
 *
 * Body `{ updates: [{ type, quantity?, size? }] }`.
 *
 * Scaling up bills immediately, and a paid dyno size needs a verified account.
 * Heroku returns a readable message for both, which handleHerokuFailure passes
 * through unchanged — the UI shows it rather than inventing its own.
 */
const updateHerokuFormation = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const updates = req.body?.updates;

	if (!Array.isArray(updates) || updates.length === 0) {
		return res.status(400).json({ message: 'Body must be { updates: [{ type, quantity?, size? }] }' });
	}

	const malformed = updates.some(
		(update: any) =>
			!update?.type ||
			(update.quantity === undefined && update.size === undefined) ||
			(update.quantity !== undefined && !Number.isInteger(update.quantity))
	);

	if (malformed) {
		return res.status(400).json({
			message: 'Each update needs a type and an integer quantity and/or a size',
		});
	}

	const described = updates
		.map((update: any) =>
			[update.type, update.quantity !== undefined ? `x${update.quantity}` : '', update.size || '']
				.filter(Boolean)
				.join(' ')
		)
		.join(', ');

	try {
		const formation = await updateFormation(token, app, updates);
		invalidate(String(account._id), app);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.scale',
			summary: `Scaled ${app}: ${described}`,
		});

		return res.status(200).json({ formation });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.scale',
			summary: `Failed to scale ${app}: ${described}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default updateHerokuFormation;
