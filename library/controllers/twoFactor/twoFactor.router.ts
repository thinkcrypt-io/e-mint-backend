import express, { Response } from 'express';
import mongoose from 'mongoose';
import Admin from '../../models/admin/model.js';
import Passkey from '../../models/twoFactor/passkey.model.js';
import { adminProtect } from '../../../imports.js';
import {
	TwoFactorError,
	checkPassword,
	loginPasskeyOptions,
	loginPasskeyVerify,
	makeBackupCodes,
	notify,
	publicPasskey,
	registerPasskeyOptions,
	registerPasskeyVerify,
	sendLoginCode,
	statusFor,
	verifyLoginCode,
} from './twoFactor.service.js';

/**
 * /admin/api/auth/2fa — two-factor sign-in (see twoFactor.service.ts).
 *
 * Sign-in, with the ticket the password step returned (no session yet):
 *   POST /login/email            { ticket }            → email a 6-digit code
 *   POST /login/verify           { ticket, method: 'email'|'backup', code } → { token }
 *   POST /login/passkey/options  { ticket }            → WebAuthn request options
 *   POST /login/passkey/verify   { ticket, response }  → { token }
 *
 * Settings, for the signed-in admin's own account:
 *   GET    /                     status: on/off, email, passkeys, backup codes left
 *   POST   /enable   { password } → turns it on, email codes on, 10 backup codes (shown once)
 *   POST   /disable  { password } → turns it off, backup codes dropped (passkeys kept)
 *   PUT    /email    { enabled }  → the email-code method on/off
 *   POST   /backup-codes { password } → 10 new codes; the old ones stop working
 *   POST   /passkeys/options      → WebAuthn creation options
 *   POST   /passkeys { response, name } → the passkey, added
 *   PATCH  /passkeys/:id { name } · DELETE /passkeys/:id
 *
 * While 2FA is on, email codes or at least one passkey must stay available.
 */

const router = express.Router();

const handle =
	(fn: (req: any, res: Response) => Promise<any>) =>
	async (req: any, res: Response) => {
		try {
			const out = await fn(req, res);
			if (!res.headersSent) res.status(200).json(out);
		} catch (e: any) {
			if (e instanceof TwoFactorError) return res.status(e.status).json({ message: e.message, ...(e.code && { code: e.code }) });
			console.error('2FA:', e?.message);
			return res.status(500).json({ message: e?.message || 'Something went wrong' });
		}
	};

/* -------------------------------------------------------------- sign-in */

router.post('/login/email', handle(req => sendLoginCode(req.body?.ticket)));
router.post('/login/verify', handle(req => verifyLoginCode(req, req.body?.ticket, req.body?.method, req.body?.code)));
router.post('/login/passkey/options', handle(req => loginPasskeyOptions(req, req.body?.ticket)));
router.post('/login/passkey/verify', handle(req => loginPasskeyVerify(req, req.body?.ticket, req.body?.response)));

/* ------------------------------------------------------------- settings */

router.use(adminProtect);

/** Refuses a change that would leave 2FA on with no way to get a code. */
const keepsAWayIn = async (adminId: any, change: { email?: boolean; removePasskey?: string }) => {
	const admin: any = await Admin.findById(adminId).lean();
	if (!admin?.twoFactorEnabled) return;
	const email = change.email ?? admin.twoFactorEmail !== false;
	const passkeys = await Passkey.countDocuments({ admin: adminId, ...(change.removePasskey && { _id: { $ne: change.removePasskey } }) });
	if (!email && !passkeys)
		throw new TwoFactorError(
			400,
			change.removePasskey
				? 'This is your only way to get a sign-in code — turn email codes on first, or turn two-factor off.'
				: 'Add a passkey first — with email codes off there’d be no way to sign in.'
		);
};

router.get('/', handle(req => statusFor(req.user._id)));

router.post(
	'/enable',
	handle(async req => {
		const admin = await checkPassword(req.user._id, req.body?.password);
		const { plain, stored } = makeBackupCodes();
		const hasPasskey = await Passkey.exists({ admin: admin._id });
		await Admin.updateOne(
			{ _id: admin._id },
			{
				$set: {
					twoFactorEnabled: true,
					// Email codes on unless a passkey is already there to fall back on
					// and the admin had turned email off.
					twoFactorEmail: hasPasskey ? admin.twoFactorEmail !== false : true,
					twoFactorBackupCodes: stored,
					twoFactorUpdatedAt: new Date(),
				},
			}
		);
		notify(admin, 'Two-factor authentication is on', 'Two-factor authentication was turned on for your MINT account. Signing in now needs a code, a passkey or a backup code after your password.');
		return { backupCodes: plain, status: await statusFor(admin._id) };
	})
);

router.post(
	'/disable',
	handle(async req => {
		const admin = await checkPassword(req.user._id, req.body?.password);
		await Admin.updateOne(
			{ _id: admin._id },
			{ $set: { twoFactorEnabled: false, twoFactorUpdatedAt: new Date() }, $unset: { twoFactorBackupCodes: 1 } }
		);
		notify(admin, 'Two-factor authentication is off', 'Two-factor authentication was turned off for your MINT account. Signing in now needs only your password.');
		return statusFor(admin._id);
	})
);

router.put(
	'/email',
	handle(async req => {
		const enabled = req.body?.enabled === true;
		if (!enabled) await keepsAWayIn(req.user._id, { email: false });
		await Admin.updateOne({ _id: req.user._id }, { $set: { twoFactorEmail: enabled, twoFactorUpdatedAt: new Date() } });
		return statusFor(req.user._id);
	})
);

router.post(
	'/backup-codes',
	handle(async req => {
		const admin = await checkPassword(req.user._id, req.body?.password);
		if (!admin.twoFactorEnabled) throw new TwoFactorError(400, 'Turn two-factor authentication on first.');
		const { plain, stored } = makeBackupCodes();
		await Admin.updateOne({ _id: admin._id }, { $set: { twoFactorBackupCodes: stored, twoFactorUpdatedAt: new Date() } });
		return { backupCodes: plain, status: await statusFor(admin._id) };
	})
);

router.post('/passkeys/options', handle(req => registerPasskeyOptions(req, req.user)));
router.post('/passkeys', handle(req => registerPasskeyVerify(req, req.user, req.body?.response, req.body?.name)));

const ownPasskey = async (req: any) => {
	if (!mongoose.isValidObjectId(req.params.id)) throw new TwoFactorError(404, 'Passkey not found');
	const key: any = await Passkey.findOne({ _id: req.params.id, admin: req.user._id });
	if (!key) throw new TwoFactorError(404, 'Passkey not found');
	return key;
};

router.patch(
	'/passkeys/:id',
	handle(async req => {
		const key = await ownPasskey(req);
		const name = String(req.body?.name || '').trim().slice(0, 60);
		if (!name) throw new TwoFactorError(400, 'Give the passkey a name');
		key.name = name;
		await key.save();
		return publicPasskey(key);
	})
);

router.delete(
	'/passkeys/:id',
	handle(async req => {
		const key = await ownPasskey(req);
		await keepsAWayIn(req.user._id, { removePasskey: String(key._id) });
		await Passkey.deleteOne({ _id: key._id });
		notify(req.user, 'A passkey was removed from your account', `The passkey “${key.name}” was removed from your MINT account.`);
		return statusFor(req.user._id);
	})
);

export default router;
