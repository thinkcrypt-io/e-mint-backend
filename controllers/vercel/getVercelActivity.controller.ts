import { Response } from 'express';
import VercelActivity from '../../models/vercel/activity.model.js';

/** GET /:id/activity — the audit feed for one account, or one project in it. */
const getVercelActivity = async (req: any, res: Response): Promise<Response> => {
	try {
		const limit = Math.min(Number(req.query?.limit) || 50, 200);
		const project = String(req.query?.project || '');

		const query: Record<string, any> = { account: req.params.id };
		if (project) query.projectName = project;

		const activity = await VercelActivity.find(query)
			.sort({ createdAt: -1 })
			.limit(limit)
			.lean();

		return res.status(200).json({ count: activity.length, activity });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: 'Could not read the activity log' });
	}
};

export default getVercelActivity;
