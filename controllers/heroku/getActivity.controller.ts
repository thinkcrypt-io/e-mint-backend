import { Response } from 'express';
import HerokuActivity from '../../models/heroku/activity.model.js';

/**
 * GET /:id/activity?app=&limit=
 *
 * The audit feed for one account, or one app within it. Rows carry config var
 * key names and never values — see the note on the model.
 */
const getHerokuActivity = async (req: any, res: Response): Promise<Response> => {
	try {
		const requested = Number(req.query.limit);
		const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 200) : 50;

		const query: any = { account: req.params.id };
		if (typeof req.query.app === 'string' && req.query.app) query.appName = req.query.app;

		const activity = await HerokuActivity.find(query).sort('-createdAt').limit(limit).lean();

		return res.status(200).json({ count: activity.length, activity });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default getHerokuActivity;
