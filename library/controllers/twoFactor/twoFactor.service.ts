import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server';
import Admin from '../../models/admin/model.js';
import Passkey from '../../models/twoFactor/passkey.model.js';
import TwoFactorChallenge from '../../models/twoFactor/challenge.model.js';
import sendMail from '../marketing/mail/sendMail.controller.js';

/**
 * Two-factor sign-in for admins.
 *
 * With `twoFactorEnabled`, a correct password (adminLogin.controller) earns a
 * **ticket** — a 10-minute JWT for this sign-in only — instead of the token.
 * The ticket is traded for the token with one of:
 *   - an **email code**: 6 digits, 10 minutes, 5 tries, resend after 30 s;
 *   - a **passkey**: a WebAuthn credential (Apple Keychain, Google Password
 *     Manager / Chrome, the browser, a phone by QR, a security key);
 *   - a **backup code**: 10 single-use codes made when 2FA is turned on.
 * Every wrong code counts against the ticket (10), after which the sign-in
 * starts again from the password.
 *
 * The ticket is signed with its own key and names the admin as `sub`, never
 * `_id`, so adminProtect — which takes any token with an `_id` signed by
 * JWT_PRIVATE_KEY — can't mistake it for a signed-in session.
 *
 * Codes are stored as HMACs (keyed by the JWT secret), never in the clear.
 * In development, mail to reserved test domains (example.com, *.test,
 * *.invalid, *.localhost) is written to the server log instead of sent.
 */

export const TICKET_TTL_S = 10 * 60;
const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_S = 30;
const MAX_CODE_ATTEMPTS = 5;
const MAX_ATTEMPTS = 10;
const BACKUP_CODES = 10;
const REGISTER_TTL_MS = 5 * 60 * 1000;

export class TwoFactorError extends Error {
	status: number;
	code?: string;
	constructor(status: number, message: string, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

const secret = () => process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542';
const ticketKey = () => crypto.createHash('sha256').update(`${secret()}:two-factor-ticket`).digest('hex');
const hmac = (value: string) => crypto.createHmac('sha256', secret()).update(value).digest('hex');
const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

/* ---------------------------------------------------------------- mail */

export const maskEmail = (email = '') => {
	const [user, domain] = String(email).split('@');
	if (!domain) return email;
	const shown = user.length <= 2 ? user[0] || '' : user.slice(0, 2);
	return `${shown}${'•'.repeat(Math.max(2, Math.min(6, user.length - shown.length)))}@${domain}`;
};

const TEST_DOMAIN = /@(example\.(com|org|net)|[^@]+\.(test|invalid|localhost))$/i;

/** Mail, or — in development, to a reserved test domain — the server log. */
const deliver = async (to: string, subject: string, text: string, html?: string) => {
	if (process.env.NODE_ENV !== 'production' && TEST_DOMAIN.test(to)) {
		console.log(`[2FA mail → ${to}] ${subject}\n${text}`);
		return;
	}
	await sendMail({ to, subject, title: 'MINT', body: text, ...(html && { html }) });
};

const shell = (heading: string, body: string) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#111827;padding:24px 32px;"><span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:#fff;">MINT</span></td></tr>
<tr><td style="padding:32px;"><h1 style="margin:0 0 16px;font-size:19px;color:#111827;">${heading}</h1>${body}</td></tr>
</table></td></tr></table></body></html>`;

const p = (text: string) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563;">${text}</p>`;

/** A security notice: 2FA turned on/off, a passkey added, a backup code used. */
export const notify = (admin: any, subject: string, line: string) =>
	deliver(
		admin.email,
		subject,
		`Hi ${admin.name || ''},\n\n${line}\n\nIf this wasn't you, change your password and contact an administrator.`,
		shell(subject, p(`Hi ${admin.name || ''},`) + p(line) + p("If this wasn't you, change your password and contact an administrator."))
	).catch(e => console.error('2FA notice:', e?.message));

/* -------------------------------------------------------------- tickets */

/** Starts a two-factor sign-in after a correct password: the ticket and the ways to finish. */
export const startLogin = async (admin: any) => {
	const jti = crypto.randomUUID();
	await TwoFactorChallenge.create({
		admin: admin._id,
		purpose: 'login',
		ticket: jti,
		expiresAt: new Date(Date.now() + TICKET_TTL_S * 1000),
	});
	const ticket = jwt.sign({ sub: String(admin._id), jti, typ: '2fa' }, ticketKey(), { expiresIn: TICKET_TTL_S });
	return { ticket, expiresIn: TICKET_TTL_S, ...(await methodsFor(admin)) };
};

/** What this admin can finish a sign-in with. */
export const methodsFor = async (admin: any) => {
	const [passkeys, withCodes] = await Promise.all([
		Passkey.countDocuments({ admin: admin._id }),
		Admin.findById(admin._id).select('+twoFactorBackupCodes').lean(),
	]);
	const backupLeft = ((withCodes as any)?.twoFactorBackupCodes || []).filter((c: any) => !c.usedAt).length;
	return {
		methods: { passkey: passkeys > 0, email: admin.twoFactorEmail !== false, backup: backupLeft > 0 },
		email: maskEmail(admin.email),
	};
};

/** The sign-in a ticket belongs to, still open: its admin and its challenge doc. */
const openTicket = async (ticket: any) => {
	let claims: any;
	try {
		claims = jwt.verify(String(ticket || ''), ticketKey());
	} catch {
		throw new TwoFactorError(410, 'This sign-in has expired. Enter your password again.', 'ticket_expired');
	}
	if (claims?.typ !== '2fa') throw new TwoFactorError(410, 'This sign-in has expired. Enter your password again.', 'ticket_expired');
	const challenge: any = await TwoFactorChallenge.findOne({ ticket: claims.jti, purpose: 'login' });
	if (!challenge || String(challenge.admin) !== String(claims.sub))
		throw new TwoFactorError(410, 'This sign-in has expired. Enter your password again.', 'ticket_expired');
	if (challenge.attempts >= MAX_ATTEMPTS)
		throw new TwoFactorError(429, 'Too many wrong codes. Enter your password again to start over.', 'ticket_locked');
	const admin: any = await Admin.findById(claims.sub);
	if (!admin || admin.isActive === false || admin.isDeleted === true)
		throw new TwoFactorError(410, 'This account can’t sign in.', 'ticket_expired');
	return { admin, challenge };
};

/** A wrong code: counted on the sign-in; too many and the ticket is spent. */
const wrong = async (challenge: any, message: string, field: 'codeAttempts' | null = null) => {
	challenge.attempts += 1;
	if (field) challenge[field] += 1;
	await challenge.save();
	const left = MAX_ATTEMPTS - challenge.attempts;
	if (left <= 0) throw new TwoFactorError(429, 'Too many wrong codes. Enter your password again to start over.', 'ticket_locked');
	throw new TwoFactorError(400, message, 'wrong_code');
};

/** Ends a sign-in: the ticket can't be used again, and the session token. */
const finish = async (admin: any, challenge: any) => {
	await TwoFactorChallenge.deleteOne({ _id: challenge._id });
	return { token: `Bearer ${admin.generateAuthToken()}` };
};

/* ---------------------------------------------------------- email codes */

export const sendLoginCode = async (ticket: any) => {
	const { admin, challenge } = await openTicket(ticket);
	if (admin.twoFactorEmail === false) throw new TwoFactorError(400, 'Email codes are turned off for this account.');
	const wait = challenge.codeSentAt ? RESEND_AFTER_S - Math.floor((Date.now() - challenge.codeSentAt.getTime()) / 1000) : 0;
	if (wait > 0) throw new TwoFactorError(429, `Wait ${wait} seconds before sending another code.`, 'resend_wait');

	const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
	challenge.codeHash = hmac(`${challenge.ticket}:${code}`);
	challenge.codeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
	challenge.codeSentAt = new Date();
	challenge.codeAttempts = 0;
	await challenge.save();

	const subject = `${code} is your MINT sign-in code`;
	await deliver(
		admin.email,
		subject,
		`Hi ${admin.name || ''},\n\nYour MINT sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't try to sign in, change your password — someone knows it.`,
		shell(
			'Your sign-in code',
			p(`Hi ${admin.name || ''}, enter this code to finish signing in to MINT. It expires in 10 minutes.`) +
				`<p style="margin:0 0 20px;font-size:30px;font-weight:700;letter-spacing:0.3em;color:#111827;">${code}</p>` +
				p("If you didn't try to sign in, change your password — someone knows it.")
		)
	);
	return { sentTo: maskEmail(admin.email), resendIn: RESEND_AFTER_S, expiresIn: CODE_TTL_MS / 1000 };
};

const normalizeBackup = (code: any) => String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const verifyLoginCode = async (ticket: any, method: any, code: any) => {
	const { admin, challenge } = await openTicket(ticket);

	if (method === 'email') {
		const digits = String(code || '').replace(/\D/g, '');
		if (!challenge.codeHash || !challenge.codeExpiresAt) throw new TwoFactorError(400, 'Send a code first.');
		if (challenge.codeExpiresAt < new Date()) throw new TwoFactorError(400, 'That code has expired — send a new one.', 'code_expired');
		if (challenge.codeAttempts >= MAX_CODE_ATTEMPTS) throw new TwoFactorError(400, 'Too many tries for this code — send a new one.', 'code_expired');
		if (digits.length !== 6 || !safeEqual(hmac(`${challenge.ticket}:${digits}`), challenge.codeHash))
			return wrong(challenge, 'That code isn’t right. Check the latest email and try again.', 'codeAttempts');
		return finish(admin, challenge);
	}

	if (method === 'backup') {
		const withCodes: any = await Admin.findById(admin._id).select('+twoFactorBackupCodes');
		const hash = hmac(`backup:${normalizeBackup(code)}`);
		const hit = (withCodes?.twoFactorBackupCodes || []).find((c: any) => !c.usedAt && safeEqual(c.hash, hash));
		if (!hit) return wrong(challenge, 'That backup code isn’t right, or it was already used.');
		// Spend it atomically, so the same code can't finish two sign-ins at once.
		const spent = await Admin.updateOne(
			{ _id: admin._id, twoFactorBackupCodes: { $elemMatch: { hash, usedAt: null } } },
			{ $set: { 'twoFactorBackupCodes.$.usedAt': new Date() } }
		);
		if (!spent.modifiedCount) return wrong(challenge, 'That backup code was already used.');
		const left = (withCodes.twoFactorBackupCodes || []).filter((c: any) => !c.usedAt).length - 1;
		notify(admin, 'A backup code was used to sign in', `A backup code was just used to sign in to your MINT account. You have ${left} left${left <= 3 ? ' — make new ones in Settings → Two-factor authentication' : ''}.`);
		return finish(admin, challenge);
	}

	throw new TwoFactorError(400, 'Choose email or backup code');
};

/* ------------------------------------------------------------- passkeys */

/**
 * Who a passkey belongs to (the relying party): the admin site's host. The
 * browser only accepts an ID that matches the page, so it's read from the
 * request's Origin when that origin is allowed — WEBAUTHN_ORIGIN (comma
 * separated) or ADMIN_FRONTEND_URL, plus any localhost port in development.
 */
const relyingParty = (req: any) => {
	const listed = String(process.env.WEBAUTHN_ORIGIN || process.env.ADMIN_FRONTEND_URL || 'http://localhost:3000')
		.split(',')
		.map(s => {
			try {
				return new URL(s.trim()).origin;
			} catch {
				return '';
			}
		})
		.filter(Boolean);
	const origin = String(req.headers?.origin || '');
	const devLocal = process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
	const chosen = listed.includes(origin) || devLocal ? origin : listed[0];
	const host = new URL(chosen).hostname;
	return {
		rpID: process.env.WEBAUTHN_RP_ID || host,
		rpName: process.env.WEBAUTHN_RP_NAME || 'MINT Admin',
		origins: [...new Set([...listed, ...(devLocal ? [origin] : [])])],
	};
};

export const loginPasskeyOptions = async (req: any, ticket: any) => {
	const { admin, challenge } = await openTicket(ticket);
	const keys = await Passkey.find({ admin: admin._id }).lean();
	if (!keys.length) throw new TwoFactorError(400, 'There’s no passkey on this account — try another way.');
	const { rpID } = relyingParty(req);
	const options = await generateAuthenticationOptions({
		rpID,
		userVerification: 'preferred',
		allowCredentials: keys.map((k: any) => ({ id: fromB64url(k.credentialId), type: 'public-key', ...(k.transports?.length && { transports: k.transports }) })),
	});
	challenge.challenge = options.challenge;
	await challenge.save();
	return options;
};

export const loginPasskeyVerify = async (req: any, ticket: any, response: any) => {
	const { admin, challenge } = await openTicket(ticket);
	if (!challenge.challenge) throw new TwoFactorError(400, 'Start the passkey sign-in again.');
	const key: any = await Passkey.findOne({ admin: admin._id, credentialId: String(response?.id || '') }).select('+publicKey');
	if (!key) return wrong(challenge, 'That passkey isn’t registered on this account — try another way.');
	const { rpID, origins } = relyingParty(req);
	let result: any;
	try {
		result = await verifyAuthenticationResponse({
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: origins,
			expectedRPID: rpID,
			requireUserVerification: false,
			authenticator: {
				credentialID: fromB64url(key.credentialId),
				credentialPublicKey: fromB64url(key.publicKey),
				counter: key.counter || 0,
				...(key.transports?.length && { transports: key.transports }),
			},
		});
	} catch (e: any) {
		return wrong(challenge, `The passkey couldn’t be checked: ${e?.message || 'try again'}`);
	}
	if (!result?.verified) return wrong(challenge, 'The passkey couldn’t be checked — try again or use another way.');
	key.counter = result.authenticationInfo?.newCounter ?? key.counter;
	key.lastUsedAt = new Date();
	await key.save();
	return finish(admin, challenge);
};

/** Settings → Add passkey, step 1: what the browser should create. */
export const registerPasskeyOptions = async (req: any, admin: any) => {
	const keys = await Passkey.find({ admin: admin._id }).lean();
	const { rpID, rpName } = relyingParty(req);
	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userID: String(admin._id),
		userName: admin.email,
		userDisplayName: admin.name || admin.email,
		attestationType: 'none',
		// Any authenticator: the platform's (Keychain, Google Password Manager,
		// Windows Hello), a phone by QR, or a security key.
		authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
		excludeCredentials: keys.map((k: any) => ({ id: fromB64url(k.credentialId), type: 'public-key', ...(k.transports?.length && { transports: k.transports }) })),
	});
	await TwoFactorChallenge.deleteMany({ admin: admin._id, purpose: 'register' });
	await TwoFactorChallenge.create({
		admin: admin._id,
		purpose: 'register',
		challenge: options.challenge,
		expiresAt: new Date(Date.now() + REGISTER_TTL_MS),
	});
	return options;
};

/** Settings → Add passkey, step 2: check what the browser made and keep it. */
export const registerPasskeyVerify = async (req: any, admin: any, response: any, name: any) => {
	const pending: any = await TwoFactorChallenge.findOne({ admin: admin._id, purpose: 'register' }).sort({ createdAt: -1 });
	if (!pending || pending.expiresAt < new Date()) throw new TwoFactorError(400, 'That took too long — add the passkey again.');
	const { rpID, origins } = relyingParty(req);
	let result: any;
	try {
		result = await verifyRegistrationResponse({
			response,
			expectedChallenge: pending.challenge,
			expectedOrigin: origins,
			expectedRPID: rpID,
			requireUserVerification: false,
		});
	} catch (e: any) {
		throw new TwoFactorError(400, `The passkey couldn’t be added: ${e?.message || 'try again'}`);
	} finally {
		await TwoFactorChallenge.deleteOne({ _id: pending._id });
	}
	if (!result?.verified || !result.registrationInfo) throw new TwoFactorError(400, 'The passkey couldn’t be checked — try again.');
	const info = result.registrationInfo;
	const credentialId = b64url(info.credentialID);
	if (await Passkey.exists({ credentialId })) throw new TwoFactorError(400, 'That passkey is already added.');
	const doc: any = await Passkey.create({
		admin: admin._id,
		name: String(name || '').trim().slice(0, 60) || 'Passkey',
		credentialId,
		publicKey: b64url(info.credentialPublicKey),
		counter: info.counter || 0,
		transports: Array.isArray(response?.response?.transports) ? response.response.transports : undefined,
		deviceType: info.credentialDeviceType,
		backedUp: info.credentialBackedUp,
	});
	notify(admin, 'A passkey was added to your account', `A passkey named “${doc.name}” was added to your MINT account.`);
	return publicPasskey(doc);
};

export const publicPasskey = (k: any) => ({
	_id: String(k._id),
	name: k.name,
	deviceType: k.deviceType,
	backedUp: k.backedUp,
	transports: k.transports || [],
	createdAt: k.createdAt,
	lastUsedAt: k.lastUsedAt || null,
});

/* --------------------------------------------------------- backup codes */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i

/** Ten new single-use codes ("k7dm-q2xa"): the plain ones for the admin to keep, the HMACs to store. */
export const makeBackupCodes = () => {
	const plain = Array.from({ length: BACKUP_CODES }, () => {
		const chars = Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]).join('');
		return `${chars.slice(0, 4)}-${chars.slice(4)}`;
	});
	return { plain, stored: plain.map(c => ({ hash: hmac(`backup:${normalizeBackup(c)}`) })) };
};

/* ------------------------------------------------------------- settings */

export const checkPassword = async (adminId: any, password: any) => {
	const admin: any = await Admin.findById(adminId).select('+password');
	if (!admin?.password || !password || !(await bcrypt.compare(String(password), admin.password)))
		throw new TwoFactorError(400, 'That password isn’t right.', 'wrong_password');
	return admin;
};

export const statusFor = async (adminId: any) => {
	const [admin, keys]: any = await Promise.all([
		Admin.findById(adminId).select('+twoFactorBackupCodes email twoFactorEnabled twoFactorEmail twoFactorUpdatedAt').lean(),
		Passkey.find({ admin: adminId }).sort({ createdAt: 1 }).lean(),
	]);
	const codes = admin?.twoFactorBackupCodes || [];
	return {
		enabled: !!admin?.twoFactorEnabled,
		email: { enabled: admin?.twoFactorEmail !== false, address: admin?.email || '' },
		passkeys: keys.map(publicPasskey),
		backupCodes: { total: codes.length, remaining: codes.filter((c: any) => !c.usedAt).length },
		updatedAt: admin?.twoFactorUpdatedAt || null,
	};
};
