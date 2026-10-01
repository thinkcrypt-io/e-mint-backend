import express, { Response } from 'express';
import mongoose from 'mongoose';
import { adminProtect } from '../../../imports.js';
import { TwoFactorError, TwoFactorService, adminTwoFactor, makeBackupCodes, notify, publicPasskey } from './twoFactor.service.js';

/**
 * /admin/api/auth/2fa — two-factor sign-in (see twoFactor.service.ts).
 *
 * Sign-in, with the ticket the password step returned (no session yet):
 *   POST /login/email            { ticket }            → email a 6-digit code
 *   POST /login/verify           { ticket, method: 'email'|'backup', code } → { token }
 *   POST /login/passkey/options  { ticket }            → WebAuthn request options
 *   POST /login/passkey/verify   { ticket, response }  → { token }
 *
 * A passkey on another device, from the phone that scanned the QR (the link token):
 *   POST /passkey-link/open      { token }             → who it's for + WebAuthn creation options
 *   POST /passkey-link/finish    { token, response, name } → the passkey, added
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
 *   POST   /passkeys/link { password } → a 10-minute QR link for another device
 *   GET    /passkeys/link/:id    its status (waiting / opened / added / expired)
 *   DELETE /passkeys/link/:id    cancel it
 *
 * While 2FA is on, email codes or at least one passkey must stay available.
 *
 * `makeTwoFactorRouter` serves one kind of account: the default export is the
 * admins' (/admin/api/auth/2fa); the tenant API mounts its own over
 * `tenantTwoFactor` (docs/multi-tenancy WO-04).
 */

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

export const makeTwoFactorRouter = (svc: TwoFactorService, protect: any) => {
	const router = express.Router();
	const { User, Passkey } = svc;

	/* -------------------------------------------------------------- sign-in */

	router.post('/login/email', handle(req => svc.sendLoginCode(req.body?.ticket)));
	router.post('/login/verify', handle(req => svc.verifyLoginCode(req, req.body?.ticket, req.body?.method, req.body?.code)));
	router.post('/login/passkey/options', handle(req => svc.loginPasskeyOptions(req, req.body?.ticket)));
	router.post('/login/passkey/verify', handle(req => svc.loginPasskeyVerify(req, req.body?.ticket, req.body?.response)));

	/* A passkey on another device: the phone that scanned the QR (no session, the link token). */
	router.post('/passkey-link/open', handle(req => svc.openPasskeyLink(req, req.body?.token)));
	router.post('/passkey-link/finish', handle(req => svc.finishPasskeyLink(req, req.body?.token, req.body?.response, req.body?.name)));

	/* ------------------------------------------------------------- settings */

	router.use(protect);

	/** Refuses a change that would leave 2FA on with no way to get a code. */
	const keepsAWayIn = async (adminId: any, change: { email?: boolean; removePasskey?: string }) => {
		const admin: any = await User.findById(adminId).lean();
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

	router.get('/', handle(req => svc.statusFor(req.user._id)));

	router.post(
		'/enable',
		handle(async req => {
			const admin = await svc.checkPassword(req.user._id, req.body?.password);
			const { plain, stored } = makeBackupCodes();
			const hasPasskey = await Passkey.exists({ admin: admin._id });
			await User.updateOne(
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
			return { backupCodes: plain, status: await svc.statusFor(admin._id) };
		})
	);

	router.post(
		'/disable',
		handle(async req => {
			const admin = await svc.checkPassword(req.user._id, req.body?.password);
			await User.updateOne(
				{ _id: admin._id },
				{ $set: { twoFactorEnabled: false, twoFactorUpdatedAt: new Date() }, $unset: { twoFactorBackupCodes: 1 } }
			);
			notify(admin, 'Two-factor authentication is off', 'Two-factor authentication was turned off for your MINT account. Signing in now needs only your password.');
			return svc.statusFor(admin._id);
		})
	);

	router.put(
		'/email',
		handle(async req => {
			const enabled = req.body?.enabled === true;
			if (!enabled) await keepsAWayIn(req.user._id, { email: false });
			await User.updateOne({ _id: req.user._id }, { $set: { twoFactorEmail: enabled, twoFactorUpdatedAt: new Date() } });
			return svc.statusFor(req.user._id);
		})
	);

	router.post(
		'/backup-codes',
		handle(async req => {
			const admin = await svc.checkPassword(req.user._id, req.body?.password);
			if (!admin.twoFactorEnabled) throw new TwoFactorError(400, 'Turn two-factor authentication on first.');
			const { plain, stored } = makeBackupCodes();
			await User.updateOne({ _id: admin._id }, { $set: { twoFactorBackupCodes: stored, twoFactorUpdatedAt: new Date() } });
			return { backupCodes: plain, status: await svc.statusFor(admin._id) };
		})
	);

	// On another device: a QR link (with the password), its status for polling, cancel.
	router.post(
		'/passkeys/link',
		handle(async req => {
			const admin = await svc.checkPassword(req.user._id, req.body?.password);
			return svc.createPasskeyLink(req, admin);
		})
	);
	router.get('/passkeys/link/:id', handle(req => svc.passkeyLinkStatus(req.user, req.params.id)));
	router.delete('/passkeys/link/:id', handle(req => svc.cancelPasskeyLink(req.user, req.params.id)));

	router.post('/passkeys/options', handle(req => svc.registerPasskeyOptions(req, req.user)));
	router.post('/passkeys', handle(req => svc.registerPasskeyVerify(req, req.user, req.body?.response, req.body?.name)));

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
			return svc.statusFor(req.user._id);
		})
	);

	return router;
};

export default makeTwoFactorRouter(adminTwoFactor, adminProtect);
