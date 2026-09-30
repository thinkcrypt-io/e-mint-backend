import { Response } from 'express';
import Issue from '../../models/issues/issues.model.js';

/**
 * The admin's Report issue page. Any signed-in admin can report a problem,
 * without the `create-issues` permission the Issues table needs: reports land
 * on that table (as open bugs, medium priority, added by the reporter) for
 * whoever triages them.
 */

const MAX_IMAGES = 10;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** POST /admin/api/issues/report — { name, description, images? } */
export const reportIssue = async (req: any, res: Response): Promise<Response> => {
	try {
		const name = text(req.body?.name, 200);
		const description = text(req.body?.description, 5000);
		if (!name) return res.status(400).json({ message: 'Give the issue a title.' });
		if (!description) return res.status(400).json({ message: 'Describe what happened.' });

		// Only strings that look like links — the images come from the media uploader.
		const images = (Array.isArray(req.body?.images) ? req.body.images : [])
			.filter((u: unknown) => typeof u === 'string' && /^(https?:\/\/|\/)/.test(u))
			.slice(0, MAX_IMAGES);

		// Only these fields: a reporter can't set the status, priority or assignees.
		const issue = await Issue.create({
			name,
			description,
			images,
			type: 'bug',
			priority: 'medium',
			status: 'open',
			addedBy: req.user?._id,
		});

		return res.status(201).json({ _id: issue._id, code: issue.code, status: issue.status });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** GET /admin/api/issues/report/mine — the caller's own reports, newest first. */
export const myReportedIssues = async (req: any, res: Response): Promise<Response> => {
	try {
		const doc = await Issue.find({ addedBy: req.user?._id })
			.select('code name description status images createdAt updatedAt')
			.sort('-createdAt')
			.limit(50)
			.lean();
		return res.status(200).json({ doc });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};
