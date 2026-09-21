import HerokuActivity, { HerokuAction } from '../../models/heroku/activity.model.js';
import { ConfigVars } from '../../lib/heroku/index.js';

type RecordArgs = {
	req: any;
	account: any;
	appName?: string;
	action: HerokuAction;
	summary: string;
	changes?: { key: string; kind: 'added' | 'updated' | 'removed' }[];
	status?: 'success' | 'failed';
	errorMessage?: string;
};

/**
 * Write one audit row. Fire-and-forget by design — an audit write failing must
 * never turn a successful Heroku action into an error the admin sees, because
 * the action already happened and telling them it failed is worse than losing
 * the log line.
 */
export const recordActivity = ({
	req,
	account,
	appName = '',
	action,
	summary,
	changes = [],
	status = 'success',
	errorMessage = '',
}: RecordArgs): void => {
	HerokuActivity.create({
		account: account?._id,
		accountLabel: account?.label || '',
		appName,
		action,
		summary,
		changes,
		performedBy: req?.user?._id,
		performedByName: req?.user?.name || 'Someone',
		status,
		errorMessage,
	}).catch((e: any) => console.error('Heroku activity log failed:', e.message));
};

/**
 * Key-level diff between what Heroku holds and what the admin submitted.
 *
 * Returns key names and a change kind only — never a value. See the note on
 * `changeSchema` in activity.model.ts for why that boundary is absolute.
 *
 * Heroku's PATCH semantics: a null value deletes the key, an absent key is left
 * alone. So `removed` is an explicit null in the patch, not a key missing
 * from it.
 */
export const diffConfigVars = (
	current: ConfigVars,
	patch: ConfigVars
): { key: string; kind: 'added' | 'updated' | 'removed' }[] => {
	const changes: { key: string; kind: 'added' | 'updated' | 'removed' }[] = [];

	Object.keys(patch).forEach(key => {
		const next = patch[key];
		const exists = Object.prototype.hasOwnProperty.call(current, key);

		if (next === null) {
			// Deleting a key that was never there is a no-op, not a change.
			if (exists) changes.push({ key, kind: 'removed' });
			return;
		}

		if (!exists) {
			changes.push({ key, kind: 'added' });
			return;
		}

		if (current[key] !== next) changes.push({ key, kind: 'updated' });
	});

	return changes.sort((a, b) => a.key.localeCompare(b.key));
};
