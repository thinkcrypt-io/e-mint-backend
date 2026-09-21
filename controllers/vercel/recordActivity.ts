import VercelActivity, { VercelAction } from '../../models/vercel/activity.model.js';
import { EnvChange } from '../../lib/vercel/index.js';

type RecordArgs = {
	req: any;
	account: any;
	teamId?: string;
	projectName?: string;
	deploymentId?: string;
	isStorefront?: boolean;
	action: VercelAction;
	summary: string;
	changes?: EnvChange[];
	status?: 'success' | 'partial' | 'failed';
	errorMessage?: string;
};

/**
 * Write one audit row. Fire-and-forget by design — an audit write failing must
 * never turn a successful Vercel action into an error the admin sees, because
 * the action already happened and telling them it failed is worse than losing
 * the log line.
 */
export const recordActivity = ({
	req,
	account,
	teamId = '',
	projectName = '',
	deploymentId = '',
	isStorefront = false,
	action,
	summary,
	changes = [],
	status = 'success',
	errorMessage = '',
}: RecordArgs): void => {
	VercelActivity.create({
		account: account?._id,
		accountLabel: account?.label || '',
		teamId,
		projectName,
		deploymentId,
		isStorefront,
		action,
		summary,
		changes,
		performedBy: req?.user?._id,
		performedByName: req?.user?.name || 'Someone',
		status,
		errorMessage,
	}).catch((e: any) => console.error('Vercel activity log failed:', e.message));
};
