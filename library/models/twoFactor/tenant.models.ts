import mongoose from 'mongoose';
import { makePasskeySchema, PasskeyType } from './passkey.model.js';
import { makeChallengeSchema, TwoFactorChallengeType } from './challenge.model.js';

/**
 * Tenant users' passkeys and two-factor challenges (docs/multi-tenancy
 * WO-04): the admin schemas over their own collections, `admin` holding the
 * TenantUser id. Separate so a credential or ticket of one kind of account can
 * never be looked up by the other's sign-in.
 */
export const TenantPasskey = mongoose.model<PasskeyType>('TenantPasskey', makePasskeySchema('TenantUser'), 'tenantpasskeys');

export const TenantTwoFactorChallenge = mongoose.model<TwoFactorChallengeType>(
	'TenantTwoFactorChallenge',
	makeChallengeSchema('TenantUser', 'TenantPasskey'),
	'tenanttwofactorchallenges'
);
