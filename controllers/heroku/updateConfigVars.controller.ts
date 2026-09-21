import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity, diffConfigVars } from './recordActivity.js';
import { getConfigVars, updateConfigVars, invalidate } from '../../lib/heroku/index.js';

/**
 * PATCH /:id/apps/:app/config-vars
 *
 * Body is a partial map: `{ KEY: 'value' }` to set, `{ KEY: null }` to delete.
 *
 * Reads the current set first, purely so the audit row can say whether each key
 * was added, updated or removed. Those names are all that is recorded — never a
 * value, on either side of the change.
 *
 * Heroku restarts every dyno on success.
 */
const updateHerokuConfigVars = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const patch = req.body?.vars;

	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
		return res.status(400).json({ message: 'Body must be { vars: { KEY: value | null } }' });
	}

	const keys = Object.keys(patch);
	if (keys.length === 0) {
		return res.status(400).json({ message: 'No config vars submitted' });
	}

	// Heroku rejects these anyway, but its error is opaque and this keeps a
	// mistyped key from looking like a platform failure.
	const invalid = keys.filter(key => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key));
	if (invalid.length) {
		return res.status(400).json({
			message: `Invalid config var name(s): ${invalid.join(', ')}. Use letters, digits and underscores, not starting with a digit.`,
		});
	}

	try {
		const current = await getConfigVars(token, app);
		const changes = diffConfigVars(current, patch);

		if (changes.length === 0) {
			return res.status(200).json({ app, count: Object.keys(current).length, vars: current, changes: [] });
		}

		const vars = await updateConfigVars(token, app, patch);
		invalidate(String(account._id), app);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'config-vars.update',
			summary: `Updated ${changes.length} config var${changes.length === 1 ? '' : 's'} on ${app}`,
			changes,
		});

		return res.status(200).json({ app, count: Object.keys(vars).length, vars, changes });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'config-vars.update',
			summary: `Failed to update config vars on ${app}`,
			// Names only, same rule as the success path.
			changes: keys.map(key => ({ key, kind: 'updated' as const })),
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default updateHerokuConfigVars;
