import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { listApps, cached, getFormation, runningSizes, HerokuAppSummary } from '../../lib/heroku/index.js';

// Formation calls in flight at once: quick for a few dozen apps without a
// burst that trips Heroku's rate limiter.
const SIZE_CONCURRENCY = 6;

/**
 * Each app's running dyno sizes (the apps table's Dyno column). Heroku has no
 * list endpoint that carries them, so it's one formation call per app, cached
 * for five minutes. An app whose formation can't be read gets `null` — the
 * list itself still loads.
 */
const withDynoSizes = async (accountId: string, token: string, apps: HerokuAppSummary[]) => {
	const out: (HerokuAppSummary & { dynoSizes: string[] | null })[] = new Array(apps.length);
	let next = 0;
	const worker = async () => {
		while (next < apps.length) {
			const i = next++;
			const app = apps[i];
			const dynoSizes = await cached(accountId, 'dynoSize', app.name, async () =>
				runningSizes(await getFormation(token, app.name))
			).catch(() => null);
			out[i] = { ...app, dynoSizes };
		}
	};
	await Promise.all(Array.from({ length: Math.min(SIZE_CONCURRENCY, apps.length) }, worker));
	return out;
};

/** GET /:id/apps — also refreshes `appCount` on the stored document. */
const getHerokuApps = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;

	try {
		const listed = await cached(String(account._id), 'apps', '', () => listApps(token));
		const apps = await withDynoSizes(String(account._id), token, listed);

		account.appCount = apps.length;
		await account.save();

		return res.status(200).json({ count: apps.length, apps });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuApps;
