import { Response } from 'express';
import Project from '../../models/project/project.model.js';
import VercelAccount from '../../models/vercel/model.js';
import HerokuAccount from '../../models/heroku/model.js';

const ACCOUNT_MODEL: Record<string, any> = {
	vercel: { model: VercelAccount, name: 'VercelAccount' },
	heroku: { model: HerokuAccount, name: 'HerokuAccount' },
};

/**
 * PUT /repos/:id/hosting — link a repo to a project on a hosting console, or
 * clear the link.
 *
 * A dedicated route rather than the generic update, for two reasons:
 *
 * 1. **Unlinking cannot be expressed through the generic PUT.** `hostingAccount`
 *    is an ObjectId — the generic Joi validator types it as a string and would
 *    reject `null`, while `''` reaches Mongoose and throws a CastError. And
 *    `hostedPlatform` is an enum, which rejects `''` too. Clearing the link
 *    needs `$unset`, which only a real controller can issue.
 * 2. **The five fields are one fact.** A platform without an account, or an
 *    account without a project, is a half-link every screen would have to
 *    special-case. Validating them together here means no half-link can be
 *    stored at all.
 */
const setRepoHosting = async (req: any, res: Response): Promise<Response> => {
	try {
		const repo = await Project.findById(req.params.id);
		if (!repo) return res.status(404).json({ message: 'Repo not found' });

		const platform = String(req.body?.hostedPlatform || '').trim();

		//Unlink
		if (!platform) {
			await Project.findByIdAndUpdate(req.params.id, {
				$unset: {
					hostedPlatform: '',
					hostingAccount: '',
					hostingAccountModel: '',
					hostedProjectId: '',
					hostedProjectName: '',
				},
			});

			return res.status(200).json({ message: 'Hosting link removed' });
		}

		const target = ACCOUNT_MODEL[platform];
		if (!target) {
			return res.status(400).json({ message: `Unknown platform "${platform}"` });
		}

		const accountId = String(req.body?.hostingAccount || '').trim();
		const projectName = String(req.body?.hostedProjectName || '').trim();

		if (!accountId || !projectName) {
			return res.status(400).json({
				message: 'A hosting link needs a platform, an account and a project. Pick all three.',
			});
		}

		// The account has to exist *on that platform*: a Vercel account id sent
		// with `platform: 'heroku'` would otherwise be stored happily and every
		// link built from it would 404.
		const account = await target.model.findById(accountId).select('_id');
		if (!account) {
			return res
				.status(400)
				.json({ message: `That account was not found among the connected ${platform} accounts.` });
		}

		repo.set({
			hostedPlatform: platform,
			hostingAccount: accountId,
			hostingAccountModel: target.name,
			hostedProjectId: String(req.body?.hostedProjectId || '').trim(),
			hostedProjectName: projectName,
		});

		await repo.save();

		const saved = await Project.findById(req.params.id).populate({
			path: 'hostingAccount',
			select: 'label code userEmail accountEmail',
		});

		return res.status(200).json({ message: 'Hosting linked', doc: saved });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message || 'Could not update the hosting link' });
	}
};

export default setRepoHosting;
