import crypto from 'crypto';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import { runUnscoped } from './tenantScope.function.js';

/**
 * A project's key (docs/api-builder D14): it names the project on the public
 * API — `/public/api/<route>?apiKey=<key>` (or the `X-Api-Key` header). It's
 * fine in a website's code, where anyone can read it: what a call may do is
 * still each endpoint's rules, and endpoints for server keys also need a
 * secret `mint_sk_` key. Regenerating makes a new one; the old one stops.
 */
export const PROJECT_KEY_PREFIX = 'mint_pk_';
const SHAPE = /^mint_pk_[a-f0-9]{32}$/;

export const newProjectKey = () => `${PROJECT_KEY_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
export const isProjectKey = (v: any): v is string => typeof v === 'string' && SHAPE.test(v);

/** The project a key names — active, in an active organization is the caller's to check. */
export const projectByKey = async (key: any) => (isProjectKey(key) ? runUnscoped(() => TenantProject.findOne({ apiKey: key }).lean()) : null);

/** The project's key, made now when an older project has none (only while still unset, so two readers get the same one). */
export const ensureProjectKey = async (project: any): Promise<string> => {
	if (project.apiKey) return project.apiKey;
	await TenantProject.updateOne({ _id: project._id, apiKey: null }, { $set: { apiKey: newProjectKey() } });
	const fresh: any = await TenantProject.findById(project._id, { apiKey: 1 }).lean();
	project.apiKey = fresh?.apiKey;
	return project.apiKey;
};

/** A new key for the project; whatever used the old one gets 401 api_key_invalid from now on. */
export const regenerateProjectKey = async (project: any): Promise<string> => {
	const apiKey = newProjectKey();
	await TenantProject.updateOne({ _id: project._id }, { $set: { apiKey } });
	project.apiKey = apiKey;
	return apiKey;
};
