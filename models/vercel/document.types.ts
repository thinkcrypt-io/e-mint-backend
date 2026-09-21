import { Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

export type VercelAccountStatus = 'active' | 'invalid' | 'unverified';
export type VercelPlan = 'hobby' | 'pro' | 'enterprise' | 'unknown';

export type VercelTeamRef = {
	teamId?: string;
	slug?: string;
	name?: string;
};

type VercelAccountType = DocumentBaseType & {
	code?: string;
	label: string;
	/** Sealed by lib/crypto — never the raw token, and never selected by default. */
	apiToken?: string;
	tokenLast4?: string;
	tokenFingerprint?: string;

	//Filled from GET /v2/user when the token is saved
	userId?: string;
	username?: string;
	userEmail?: string;
	displayName?: string;
	plan?: VercelPlan;

	/** Empty on a personal account. */
	teams?: VercelTeamRef[];
	/** Undefined on a personal account, and that is the correct scope. */
	defaultTeamId?: string;

	status?: VercelAccountStatus;
	lastSyncedAt?: Date;
	lastError?: string;
	projectCount?: number;

	client?: Types.ObjectId;
	project?: Types.ObjectId;
	note?: string;

	privacy?: 'public' | 'private' | 'only-me';
	addedBy?: Types.ObjectId;
	access?: Types.ObjectId[];
};

export default VercelAccountType;
