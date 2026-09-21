import { Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

export type HerokuAccountStatus = 'active' | 'invalid' | 'unverified';

type HerokuAccountType = DocumentBaseType & {
	code?: string;
	label: string;
	/** Sealed by lib/crypto — never the raw token, and never selected by default. */
	apiKey?: string;
	keyLast4?: string;
	keyFingerprint?: string;

	//Filled from GET /account when the key is saved
	accountEmail?: string;
	accountId?: string;
	accountName?: string;
	isVerified?: boolean;
	twoFactor?: boolean;
	defaultTeam?: string;

	status?: HerokuAccountStatus;
	lastSyncedAt?: Date;
	lastError?: string;
	appCount?: number;

	client?: Types.ObjectId;
	project?: Types.ObjectId;
	note?: string;

	privacy?: 'public' | 'private' | 'only-me';
	addedBy?: Types.ObjectId;
	access?: Types.ObjectId[];
};

export default HerokuAccountType;
