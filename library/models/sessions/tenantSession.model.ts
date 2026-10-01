import mongoose from 'mongoose';
import { makeSessionSchema, AdminSessionType } from './adminSession.model.js';
import { makeBlacklistSchema, BlacklistedTokenType } from './blacklistedToken.model.js';

/**
 * Tenant users' sign-in sessions and their revocations (docs/multi-tenancy
 * WO-04): the admin schemas over their own collections, `admin` holding the
 * TenantUser id. Kept apart from the admins' so neither list can show, or
 * sign out, the other's.
 */
export const TenantSession = mongoose.model<AdminSessionType>('TenantSession', makeSessionSchema('TenantUser'), 'tenantsessions');

export const TenantBlacklistedToken = mongoose.model<BlacklistedTokenType>(
	'TenantBlacklistedToken',
	makeBlacklistSchema('TenantUser', 'TenantSession'),
	'tenantblacklistedtokens'
);
