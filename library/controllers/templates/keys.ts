import crypto from 'crypto';
import mongoose from 'mongoose';
import { TemplateKey, TEMPLATE_KEY_SCOPES } from '../../models/templates/_index.js';
import { BuildError } from '../builder/models.controller.js';
import { hashKey } from '../builder/features.controller.js';
import Role from '../../models/admin-role/model.js';

/**
 * The keys Claude connects to the Templates MCP with (docs/templates TD9).
 * The secret (`emt_…`) is shown once; only its sha256 is kept. Scopes:
 *   read     — list and read templates, check them, export
 *   write    — create and change drafts, import
 *   preview  — build a draft into a throwaway sandbox project
 *   publish  — publish a version (still needs the owner's publishing permission)
 */

export const KEY_PREFIX = 'emt_';
const DEFAULT_SCOPES = ['read', 'write', 'preview'];

export const listKeys = async () =>
	TemplateKey.find({}).sort({ revokedAt: 1, createdAt: -1 }).populate('createdBy', 'name email').lean();

export const createKey = async (req: any, input: { name?: any; scopes?: any; expiresInDays?: any }) => {
	const name = String(input.name || '').trim().slice(0, 80);
	if (!name) throw new BuildError(400, 'Name the key after where it’s used, e.g. “Claude Code — laptop”.');
	const scopes = (Array.isArray(input.scopes) ? input.scopes : DEFAULT_SCOPES).filter((s: any) => (TEMPLATE_KEY_SCOPES as readonly string[]).includes(s));
	if (!scopes.length) throw new BuildError(400, `Pick at least one scope: ${TEMPLATE_KEY_SCOPES.join(', ')}.`);
	const days = Number(input.expiresInDays);
	const secret = `${KEY_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
	const doc = await TemplateKey.create({
		name,
		prefix: secret.slice(0, 10),
		hash: hashKey(secret),
		scopes,
		createdBy: req.user._id,
		...(days > 0 && { expiresAt: new Date(Date.now() + days * 86400000) }),
	});
	const { hash, ...plain } = doc.toObject();
	return { doc: plain, secret };
};

/** Revoked at once; kept so the list shows it was. Anyone but a '*' role revokes only their own. */
export const revokeKey = async (req: any, id: any) => {
	if (!mongoose.isValidObjectId(id)) throw new BuildError(400, 'Invalid id');
	const role: any = req.user?.role ? await Role.findById(req.user.role?._id || req.user.role, { permissions: 1 }).lean() : null;
	const all = (role?.permissions || []).includes('*');
	const r = await TemplateKey.updateOne({ _id: id, ...(all ? {} : { createdBy: req.user._id }), revokedAt: null }, { $set: { revokedAt: new Date() } });
	if (!r.matchedCount) throw new BuildError(404, 'Key not found, or already revoked');
};

/** The key a request carries, checked: header or path, not revoked, not expired. */
export const keyFromSecret = async (secret: string) => {
	if (!secret || !secret.startsWith(KEY_PREFIX)) return { error: 'A Templates MCP key (emt_…) is required — make one in Template Studio → Connect Claude.' };
	const key: any = await TemplateKey.findOne({ hash: hashKey(secret) });
	if (!key || key.revokedAt) return { error: 'This key was revoked or doesn’t exist.' };
	if (key.expiresAt && key.expiresAt < new Date()) return { error: 'This key has expired — make a new one in Template Studio → Connect Claude.' };
	if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) await TemplateKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } });
	return { key };
};
