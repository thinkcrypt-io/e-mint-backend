import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { getConfigVars, toEnvFile, toJsonFile } from '../../lib/heroku/index.js';

/** GET /:id/apps/:app/config-vars/download?format=env|json */
const downloadHerokuConfigVars = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const format = req.query.format === 'json' ? 'json' : 'env';

	try {
		const vars = await getConfigVars(token, app);

		console.info(
			`Heroku config-vars download: admin=${req.user?._id} (${req.user?.name}) account=${account.code} app=${app} keys=${Object.keys(vars).length} at=${new Date().toISOString()}`
		);

		res.set('Cache-Control', 'no-store');

		if (format === 'json') {
			res.set('Content-Type', 'application/json');
			res.set('Content-Disposition', `attachment; filename="${app}.config.json"`);
			return res.status(200).send(toJsonFile(vars));
		}

		res.set('Content-Type', 'text/plain; charset=utf-8');
		res.set('Content-Disposition', `attachment; filename="${app}.env"`);
		return res.status(200).send(toEnvFile(app, vars));
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default downloadHerokuConfigVars;
