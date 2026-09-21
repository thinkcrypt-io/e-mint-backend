import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	listEnv,
	getProject,
	createEnv,
	updateEnv,
	deleteEnv,
	diffEnv,
	envIdentity,
	invalidate,
	findManagedProject,
	toVercelError,
	VercelEnvRecord,
	StagedEnvRecord,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

type Operation =
	| { kind: 'create'; record: StagedEnvRecord }
	| { kind: 'update'; id: string; record: StagedEnvRecord }
	| { kind: 'delete'; id: string; key: string };

/**
 * Turn "here is the desired set" into an ordered list of writes.
 *
 * Order is deliberate: **create, then update, then delete.** Vercel has no
 * atomic multi-record write, so a batch can fail half way through — and if
 * deletions ran first, a failure would leave a variable removed with its
 * replacement never added. Destructive last means every partial outcome is a
 * superset of where it started.
 */
const planWrites = (existing: VercelEnvRecord[], staged: StagedEnvRecord[]): Operation[] => {
	const byId: Record<string, VercelEnvRecord> = {};
	const byIdentity: Record<string, VercelEnvRecord> = {};

	existing.forEach(record => {
		byId[record.id] = record;
		byIdentity[envIdentity(record)] = record;
	});

	const creates: Operation[] = [];
	const updates: Operation[] = [];
	const seen: Record<string, boolean> = {};

	staged.forEach(record => {
		const prior = (record.id && byId[record.id]) || byIdentity[envIdentity(record)];

		if (!prior) {
			creates.push({ kind: 'create', record });
			return;
		}

		seen[prior.id] = true;

		const valueChanged = prior.readable
			? typeof record.value === 'string' && record.value !== prior.value
			: typeof record.value === 'string' && record.value.length > 0;

		const shapeChanged =
			envIdentity(prior) !== envIdentity(record) || (record.type && record.type !== prior.type);

		if (valueChanged || shapeChanged) updates.push({ kind: 'update', id: prior.id, record });
	});

	const deletes: Operation[] = existing
		.filter(record => !seen[record.id])
		.map(record => ({ kind: 'delete', id: record.id, key: record.key }) as Operation);

	return creates.concat(updates, deletes);
};

const describe = (op: Operation): string => {
	if (op.kind === 'delete') return `remove ${op.key}`;
	return `${op.kind === 'create' ? 'add' : 'update'} ${op.record.key}`;
};

/**
 * POST /:id/projects/:project/env — commit a staged batch.
 *
 * Unlike Heroku, **saving does not restart anything**: Vercel env changes take
 * effect on the next deployment and never touch the running one. The response
 * carries `requiresRedeploy` so the UI can offer that as the next step rather
 * than leaving the admin thinking the change is already live.
 */
const updateVercelEnv = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);
	const staged: StagedEnvRecord[] = Array.isArray(req.body?.records) ? req.body.records : [];

	if (!staged.length && !req.body?.allowEmpty) {
		return res.status(400).json({
			message: 'No records were supplied. Sending an empty set would delete every variable; pass allowEmpty to mean it.',
		});
	}

	let project;
	let existing: VercelEnvRecord[];

	try {
		project = await getProject(token, ref, team);
		// Read decrypted so an unchanged value is recognised as unchanged; the
		// values never leave this function.
		existing = await listEnv(token, project.id, { team, decrypt: true });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}

	const storefront = await findManagedProject(project.id);
	const changes = diffEnv(existing, staged);
	const touchesProduction = changes.some(c => c.target === 'production');

	// A storefront's production environment belongs to a real shop, so the
	// project name has to be typed before anything is written.
	if (storefront && touchesProduction) {
		const confirm = String(req.body?.confirm || '');

		if (confirm !== project.name) {
			return res.status(400).json({
				message: `${project.name} is the live storefront for ${storefront.shopName}. Type the project name exactly to change its production environment.`,
				requiresConfirmation: true,
				storefront,
				changes,
			});
		}
	}

	const operations = planWrites(existing, staged);

	if (!operations.length) {
		return res.status(200).json({ message: 'Nothing to change', changes: [], applied: [] });
	}

	const applied: string[] = [];
	let failure: { at: string; message: string } | null = null;

	for (let i = 0; i < operations.length; i += 1) {
		const op = operations[i];

		try {
			if (op.kind === 'create') {
				await createEnv(
					token,
					project.id,
					[
						{
							key: op.record.key,
							value: String(op.record.value ?? ''),
							type: op.record.type || 'encrypted',
							target: op.record.target,
							...(op.record.gitBranch ? { gitBranch: op.record.gitBranch } : {}),
						},
					],
					team
				);
			} else if (op.kind === 'update') {
				await updateEnv(
					token,
					project.id,
					op.id,
					{
						key: op.record.key,
						...(typeof op.record.value === 'string' ? { value: op.record.value } : {}),
						...(op.record.type ? { type: op.record.type } : {}),
						target: op.record.target,
						...(op.record.gitBranch ? { gitBranch: op.record.gitBranch } : {}),
					},
					team
				);
			} else {
				await deleteEnv(token, project.id, op.id, team);
			}

			applied.push(describe(op));
		} catch (e: any) {
			failure = { at: describe(op), message: toVercelError(e).message };
			break;
		}
	}

	invalidate(String(account._id), project.id);

	const remaining = operations.slice(applied.length).map(describe);
	const status = failure ? (applied.length ? 'partial' : 'failed') : 'success';

	recordActivity({
		req,
		account,
		teamId: team,
		projectName: project.name,
		isStorefront: !!storefront,
		action: 'env.update',
		summary: failure
			? `${applied.length} of ${operations.length} environment change(s) applied to ${project.name} before failing`
			: `Applied ${operations.length} environment change(s) to ${project.name}`,
		changes,
		status,
		errorMessage: failure ? `${failure.message} (at: ${failure.at})` : '',
	});

	// A partial write is its own outcome. Reporting it as a success would claim
	// an environment that does not exist; reporting it as a failure would imply
	// nothing changed when several variables did.
	return res.status(failure ? 207 : 200).json({
		message: failure
			? `Applied ${applied.length} of ${operations.length} changes, then stopped.`
			: 'Environment updated',
		status,
		changes,
		applied,
		failed: failure,
		remaining: failure ? remaining : [],
		// Vercel never applies env changes to a running deployment.
		requiresRedeploy: touchesProduction && !!applied.length,
		project: { id: project.id, name: project.name },
	});
};

export default updateVercelEnv;
