import crypto from 'crypto';
import mongoose from 'mongoose';
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
import { issueSession } from '../../functions/sessions.function.js';

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
 *
 * `makeTwoFactor` builds the service over a user model and its passkey and
 * challenge collections. The exports at the bottom are the admins' (the
 * names every admin path has always imported); `tenantTwoFactor` is the
 * tenant users' (docs/multi-tenancy WO-04) — its own collections, its own
 * ticket key, its own sign-in session (with the organization in the token).
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
export const deliver = async (to: string, subject: string, text: string, html?: string) => {
	if (process.env.NODE_ENV !== 'production' && TEST_DOMAIN.test(to)) {
		console.log(`[mail → ${to}] ${subject}\n${text}`);
		return;
	}
	await sendMail({ to, subject, title: 'MINT', body: text, ...(html && { html }) });
};

export const shell = (heading: string, body: string) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#111827;padding:24px 32px;"><span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:#fff;">MINT</span></td></tr>
<tr><td style="padding:32px;"><h1 style="margin:0 0 16px;font-size:19px;color:#111827;">${heading}</h1>${body}</td></tr>
</table></td></tr></table></body></html>`;

export const p = (text: string) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563;">${text}</p>`;

/** A security notice: 2FA turned on/off, a passkey added, a backup code used. */
export const notify = (admin: any, subject: string, line: string) =>
	deliver(
		admin.email,
		subject,
		`Hi ${admin.name || ''},\n\n${line}\n\nIf this wasn't you, change your password and contact an administrator.`,
		shell(subject, p(`Hi ${admin.name || ''},`) + p(line) + p("If this wasn't you, change your password and contact an administrator."))
	).catch(e => console.error('2FA notice:', e?.message));

const normalizeBackup = (code: any) => String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');

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

/* -------------------------------------------------------------- service */

type TwoFactorConfig = {
	/** The account model: Admin or TenantUser (same two-factor fields). */
	User: mongoose.Model<any>;
	Passkey: mongoose.Model<any>;
	Challenge: mongoose.Model<any>;
	/** Signs a ticket; different per kind, so one kind's ticket is useless to the other's sign-in. */
	ticketSalt: string;
	/** The finished sign-in's token ("Bearer …"). */
	issue: (req: any, user: any, method: string) => Promise<string>;
	/** Allowed browser origins for passkeys (the panel's addresses). */
	origins: () => string;
	rpName: string;
};

export const makeTwoFactor = (cfg: TwoFactorConfig) => {
	const { User, Passkey, Challenge: TwoFactorChallenge } = cfg;
	const ticketKey = crypto.createHash('sha256').update(`${secret()}:${cfg.ticketSalt}`).digest('hex');

	/* -------------------------------------------------------------- tickets */

	/** Starts a two-factor sign-in after a correct password: the ticket and the ways to finish. */
	const startLogin = async (admin: any) => {
		const jti = crypto.randomUUID();
		await TwoFactorChallenge.create({
			admin: admin._id,
			purpose: 'login',
			ticket: jti,
			expiresAt: new Date(Date.now() + TICKET_TTL_S * 1000),
		});
		const ticket = jwt.sign({ sub: String(admin._id), jti, typ: '2fa' }, ticketKey, { expiresIn: TICKET_TTL_S });
		return { ticket, expiresIn: TICKET_TTL_S, ...(await methodsFor(admin)) };
	};

	/** What this admin can finish a sign-in with. */
	const methodsFor = async (admin: any) => {
		const [passkeys, withCodes] = await Promise.all([
			Passkey.countDocuments({ admin: admin._id }),
			User.findById(admin._id).select('+twoFactorBackupCodes').lean(),
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
			claims = jwt.verify(String(ticket || ''), ticketKey);
		} catch {
			throw new TwoFactorError(410, 'This sign-in has expired. Enter your password again.', 'ticket_expired');
		}
		if (claims?.typ !== '2fa') throw new TwoFactorError(410, 'This sign-in has expired. Enter your password again.', 'ticket_expired');
		const challenge: any = await TwoFactorChallenge.findOne({ ticket: claims.jti, purpose: 'login' });
		if (!challenge || String(challenge.admin) !== String(claims.sub))
			throw new TwoFactorError(410, 'This sign-in has expired. Enter your password again.', 'ticket_expired');
		if (challenge.attempts >= MAX_ATTEMPTS)
			throw new TwoFactorError(429, 'Too many wrong codes. Enter your password again to start over.', 'ticket_locked');
		const admin: any = await User.findById(claims.sub);
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
	const finish = async (req: any, admin: any, challenge: any, method: string) => {
		await TwoFactorChallenge.deleteOne({ _id: challenge._id });
		return { token: await cfg.issue(req, admin, method) };
	};

	/* ---------------------------------------------------------- email codes */

	const sendLoginCode = async (ticket: any) => {
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


	const verifyLoginCode = async (req: any, ticket: any, method: any, code: any) => {
		const { admin, challenge } = await openTicket(ticket);

		if (method === 'email') {
			const digits = String(code || '').replace(/\D/g, '');
			if (!challenge.codeHash || !challenge.codeExpiresAt) throw new TwoFactorError(400, 'Send a code first.');
			if (challenge.codeExpiresAt < new Date()) throw new TwoFactorError(400, 'That code has expired — send a new one.', 'code_expired');
			if (challenge.codeAttempts >= MAX_CODE_ATTEMPTS) throw new TwoFactorError(400, 'Too many tries for this code — send a new one.', 'code_expired');
			if (digits.length !== 6 || !safeEqual(hmac(`${challenge.ticket}:${digits}`), challenge.codeHash))
				return wrong(challenge, 'That code isn’t right. Check the latest email and try again.', 'codeAttempts');
			return finish(req, admin, challenge, 'email-code');
		}

		if (method === 'backup') {
			const withCodes: any = await User.findById(admin._id).select('+twoFactorBackupCodes');
			const hash = hmac(`backup:${normalizeBackup(code)}`);
			const hit = (withCodes?.twoFactorBackupCodes || []).find((c: any) => !c.usedAt && safeEqual(c.hash, hash));
			if (!hit) return wrong(challenge, 'That backup code isn’t right, or it was already used.');
			// Spend it atomically, so the same code can't finish two sign-ins at once.
			const spent = await User.updateOne(
				{ _id: admin._id, twoFactorBackupCodes: { $elemMatch: { hash, usedAt: null } } },
				{ $set: { 'twoFactorBackupCodes.$.usedAt': new Date() } }
			);
			if (!spent.modifiedCount) return wrong(challenge, 'That backup code was already used.');
			const left = (withCodes.twoFactorBackupCodes || []).filter((c: any) => !c.usedAt).length - 1;
			notify(admin, 'A backup code was used to sign in', `A backup code was just used to sign in to your MINT account. You have ${left} left${left <= 3 ? ' — make new ones in Settings → Sign-in & security' : ''}.`);
			return finish(req, admin, challenge, 'backup-code');
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
		const listed = cfg.origins()
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
			rpName: cfg.rpName,
			origins: [...new Set([...listed, ...(devLocal ? [origin] : [])])],
		};
	};

	const loginPasskeyOptions = async (req: any, ticket: any) => {
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

	const loginPasskeyVerify = async (req: any, ticket: any, response: any) => {
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
		return finish(req, admin, challenge, 'passkey');
	};

	/** What the browser should create for `admin` — any authenticator, never one already added. */
	const creationOptions = async (req: any, admin: any) => {
		const keys = await Passkey.find({ admin: admin._id }).lean();
		const { rpID, rpName } = relyingParty(req);
		return generateRegistrationOptions({
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
	};

	/** Checks what the browser made against the challenge it was given, and keeps it. */
	const savePasskey = async (req: any, admin: any, response: any, name: any, expectedChallenge: string, how = '') => {
		const { rpID, origins } = relyingParty(req);
		let result: any;
		try {
			result = await verifyRegistrationResponse({
				response,
				expectedChallenge,
				expectedOrigin: origins,
				expectedRPID: rpID,
				requireUserVerification: false,
			});
		} catch (e: any) {
			throw new TwoFactorError(400, `The passkey couldn’t be added: ${e?.message || 'try again'}`);
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
		notify(admin, 'A passkey was added to your account', `A passkey named “${doc.name}” was added to your MINT account${how}.`);
		return doc;
	};

	/** Settings → Add passkey (this device), step 1: what the browser should create. */
	const registerPasskeyOptions = async (req: any, admin: any) => {
		const options = await creationOptions(req, admin);
		await TwoFactorChallenge.deleteMany({ admin: admin._id, purpose: 'register' });
		await TwoFactorChallenge.create({
			admin: admin._id,
			purpose: 'register',
			challenge: options.challenge,
			expiresAt: new Date(Date.now() + REGISTER_TTL_MS),
		});
		return options;
	};

	/** Settings → Add passkey (this device), step 2: check what the browser made and keep it. */
	const registerPasskeyVerify = async (req: any, admin: any, response: any, name: any) => {
		const pending: any = await TwoFactorChallenge.findOne({ admin: admin._id, purpose: 'register' }).sort({ createdAt: -1 });
		if (!pending || pending.expiresAt < new Date()) throw new TwoFactorError(400, 'That took too long — add the passkey again.');
		try {
			return publicPasskey(await savePasskey(req, admin, response, name, pending.challenge));
		} finally {
			await TwoFactorChallenge.deleteOne({ _id: pending._id });
		}
	};

	/* ------------------------------------------- a passkey on another device */

	/**
	 * Add a passkey on your phone (or any other device) by QR code.
	 *
	 * Settings makes a **link** (with the password): a random token, stored only
	 * as its hash, for 10 minutes and one passkey. The QR holds
	 * `<admin site>/passkey/add#<token>` — after the `#`, so the token never
	 * reaches a server log or a Referer. The phone opens it, is given creation
	 * options for this admin, makes the passkey in its own keychain (iCloud
	 * Keychain, Google Password Manager), and sends it back with the token. The
	 * computer that showed the QR polls the link's status: waiting → opened (on
	 * "Safari on iPhone") → added.
	 *
	 * Whoever holds the QR can add a passkey to the account — hence the
	 * password, the short life, single use and the security email.
	 */
	const LINK_TTL_MS = 10 * 60 * 1000;
	const hashToken = (token: any) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

	/** The admin site's address for the link — the page that asked, if it's allowed, else ADMIN_FRONTEND_URL. */
	const siteOrigin = (req: any) => {
		const { origins } = relyingParty(req);
		const origin = String(req.headers?.origin || '');
		return origins.includes(origin) ? origin : origins[0] || 'http://localhost:3000';
	};

	const linkView = (l: any) => ({
		_id: String(l._id),
		status: l.linkStatus || 'waiting',
		device: l.linkDevice || null,
		passkey: l.linkPasskey ? { _id: String(l.linkPasskey), name: l.linkPasskeyName } : null,
		expiresAt: l.expiresAt,
	});

	const createPasskeyLink = async (req: any, admin: any) => {
		const token = crypto.randomBytes(24).toString('base64url');
		// One open link per admin: a new QR replaces the last.
		await TwoFactorChallenge.deleteMany({ admin: admin._id, purpose: 'link' });
		const link: any = await TwoFactorChallenge.create({
			admin: admin._id,
			purpose: 'link',
			ticket: hashToken(token),
			linkStatus: 'waiting',
			expiresAt: new Date(Date.now() + LINK_TTL_MS),
		});
		return { ...linkView(link), url: `${siteOrigin(req)}/passkey/add#${token}` };
	};

	const passkeyLinkStatus = async (admin: any, id: any) => {
		const link: any = mongoose.isValidObjectId(id) ? await TwoFactorChallenge.findOne({ _id: id, admin: admin._id, purpose: 'link' }).lean() : null;
		if (!link || link.expiresAt < new Date()) return { _id: String(id), status: 'expired', device: null, passkey: null, expiresAt: link?.expiresAt || null };
		return linkView(link);
	};

	const cancelPasskeyLink = async (admin: any, id: any) => {
		if (mongoose.isValidObjectId(id)) await TwoFactorChallenge.deleteOne({ _id: id, admin: admin._id, purpose: 'link', linkStatus: { $ne: 'added' } });
		return { message: 'Cancelled' };
	};

	const openLink = async (token: any) => {
		const link: any = await TwoFactorChallenge.findOne({ ticket: hashToken(token), purpose: 'link' });
		if (!link || link.expiresAt < new Date() || link.linkStatus === 'added')
			throw new TwoFactorError(410, 'This QR code has expired or was already used. Make a new one in Settings → Sign-in & security.', 'link_expired');
		const admin: any = await User.findById(link.admin);
		if (!admin || admin.isActive === false || admin.isDeleted === true) throw new TwoFactorError(410, 'This account can’t add passkeys.', 'link_expired');
		return { link, admin };
	};

	/** The phone opened the link: who it's for, and what to create. */
	const openPasskeyLink = async (req: any, token: any) => {
		const { link, admin } = await openLink(token);
		const options = await creationOptions(req, admin);
		const ua = String(req.headers?.['user-agent'] || '');
		const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
		const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '';
		const device = os ? `${browser} on ${os}` : browser;
		link.challenge = options.challenge;
		link.linkStatus = 'opened';
		link.linkDevice = device;
		await link.save();
		return { admin: { name: admin.name, email: maskEmail(admin.email) }, suggestedName: device, options, expiresAt: link.expiresAt };
	};

	/** The phone made the passkey: check it and keep it; the link is spent. */
	const finishPasskeyLink = async (req: any, token: any, response: any, name: any) => {
		const { link, admin } = await openLink(token);
		if (!link.challenge) throw new TwoFactorError(400, 'Open the link again to start over.');
		const doc = await savePasskey(req, admin, response, name || link.linkDevice, link.challenge, ' from another device, by QR code');
		link.linkStatus = 'added';
		link.linkPasskey = doc._id;
		link.linkPasskeyName = doc.name;
		link.challenge = undefined;
		// Kept a little longer so the computer showing the QR sees "added".
		link.expiresAt = new Date(Date.now() + 2 * 60 * 1000);
		await link.save();
		return { passkey: publicPasskey(doc) };
	};



	/* ------------------------------------------------------------- settings */

	const checkPassword = async (adminId: any, password: any) => {
		const admin: any = await User.findById(adminId).select('+password');
		if (!admin?.password || !password || !(await bcrypt.compare(String(password), admin.password)))
			throw new TwoFactorError(400, 'That password isn’t right.', 'wrong_password');
		return admin;
	};

	const statusFor = async (adminId: any) => {
		const [admin, keys]: any = await Promise.all([
			User.findById(adminId).select('+twoFactorBackupCodes email twoFactorEnabled twoFactorEmail twoFactorUpdatedAt').lean(),
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

	return {
		User,
		Passkey,
		startLogin,
		methodsFor,
		sendLoginCode,
		verifyLoginCode,
		loginPasskeyOptions,
		loginPasskeyVerify,
		registerPasskeyOptions,
		registerPasskeyVerify,
		createPasskeyLink,
		passkeyLinkStatus,
		cancelPasskeyLink,
		openPasskeyLink,
		finishPasskeyLink,
		checkPassword,
		statusFor,
	};
};

export type TwoFactorService = ReturnType<typeof makeTwoFactor>;

/** The admins' two-factor sign-in — the exports every admin path uses. */
export const adminTwoFactor = makeTwoFactor({
	User: Admin,
	Passkey,
	Challenge: TwoFactorChallenge,
	ticketSalt: 'two-factor-ticket',
	issue: (req, admin, method) => issueSession(admin, req, method),
	origins: () => String(process.env.WEBAUTHN_ORIGIN || process.env.ADMIN_FRONTEND_URL || 'http://localhost:3000'),
	rpName: process.env.WEBAUTHN_RP_NAME || 'MINT Admin',
});

export const {
	startLogin,
	methodsFor,
	sendLoginCode,
	verifyLoginCode,
	loginPasskeyOptions,
	loginPasskeyVerify,
	registerPasskeyOptions,
	registerPasskeyVerify,
	createPasskeyLink,
	passkeyLinkStatus,
	cancelPasskeyLink,
	openPasskeyLink,
	finishPasskeyLink,
	checkPassword,
	statusFor,
} = adminTwoFactor;
