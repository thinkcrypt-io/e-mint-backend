import jwt from 'jsonwebtoken';
import ProjectCustomer from '../models/tenancy/projectCustomer.model.js';
import { accountByEmail, accountsModel, currentAccount, linkCustomerRecord } from './authMapping.function.js';
import { esc, para, resolveMailConfig, sendOrgMail } from './mail.function.js';
import { designMail } from './mailDesign.function.js';
import { ensureProjectKey } from './projectKey.function.js';
import { TenancyError } from './tenancy.function.js';

/**
 * Forgot password for a project's customers (docs/widgets W-25) — accounts in
 * MINT's Customers and accounts the project's own model holds alike.
 *
 * `POST /auth/forgot` emails a link, from the business's own email (M-02),
 * to the page the visitor asked from — when that page is on one of the
 * project's own domains (or its MINT-hosted site; localhost in development) —
 * else to MINT's reset page (GET /public/reset-password). The token rides in
 * the link's #fragment, so it never reaches a server's logs. It's a JWT that
 * lasts an hour and carries the account's `tokenVersion`: setting the
 * password bumps it, so a link works once and every device signs out.
 *
 * The answer never says whether the email has an account: the lookup and the
 * email happen after the response.
 */

export const RESET_TOKEN_KIND = 'customer-reset';
const RESET_TTL = '1h';
const secret = () => process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542';

const hostOf = (v: string) => {
	try {
		const u = new URL(v);
		return /^https?:$/.test(u.protocol) ? u : null;
	} catch {
		return null;
	}
};

/** A page a reset link may lead to: on the project's own domains, its MINT-hosted site, or (development) localhost. */
export const ownPage = (project: any, returnTo?: string) => {
	const u = returnTo ? hostOf(String(returnTo)) : null;
	if (!u) return null;
	const host = u.hostname.toLowerCase();
	const bare = host.replace(/^www\./, '');
	const domains: string[] = (project.domains || []).map((d: string) => d.toLowerCase().replace(/:\d+$/, '').replace(/^www\./, ''));
	const root = String(process.env.SITES_ROOT_DOMAIN || '').toLowerCase();
	const ok =
		domains.some(d => bare === d || bare.endsWith(`.${d}`)) ||
		(!!root && !!project.publicSlug && host === `${project.publicSlug}.${root}`) ||
		(process.env.NODE_ENV !== 'production' && /^(localhost|127\.0\.0\.1|.+\.localhost)$/.test(host));
	if (!ok || (process.env.NODE_ENV === 'production' && u.protocol !== 'https:')) return null;
	u.hash = '';
	return u.toString();
};

/** Is there a way to email this project's customers? (Asked before saying a link is on its way.) */
export const canEmailCustomers = async (project: any) => !!(await resolveMailConfig(project.organization, project._id).catch(() => null));

/** The account with this email, as sign-in finds it — the model's (when it holds accounts) first, then MINT's. */
const accountFor = async (app: any, project: any, email: string) => {
	const held = await accountsModel(app, project);
	return (held && (await accountByEmail(held, email))) || (await ProjectCustomer.findOne({ email, holder: { $ne: 'model' } }));
};

/** Emails a reset link when the email has an account — quietly nothing when it doesn't. Runs in the project's scope. */
export const sendResetLink = async (app: any, project: any, opts: { email: string; returnTo?: string; apiBase: string }) => {
	const row: any = await accountFor(app, project, opts.email);
	if (!row || row.isActive === false) return;
	const now: any = await currentAccount(app, project, row.toObject ? row.toObject() : row);
	if (!now) return;
	const token = jwt.sign({ _id: String(row._id), kind: RESET_TOKEN_KIND, project: String(project._id), v: row.tokenVersion || 0 }, secret(), { expiresIn: RESET_TTL });
	const page = ownPage(project, opts.returnTo) || `${opts.apiBase}/public/reset-password?apiKey=${encodeURIComponent(await ensureProjectKey(project))}`;
	const link = `${page}#mint_reset=${token}`;
	const cfg = await resolveMailConfig(project.organization, project._id).catch(() => null);
	if (!cfg) return;
	const name = project.name;
	const hi = now.name ? `Hi ${now.name},` : 'Hi,';
	await sendOrgMail(
		{
			to: now.email,
			subject: `Reset your password for ${name}`,
			text: `${hi}\n\nSomeone asked to reset the password of your account at ${name}. To choose a new one, open this link within an hour:\n\n${link}\n\nIf it wasn’t you, ignore this email — your password stays as it is.\n\n— ${cfg.fromName || name}`,
			html: await designMail(project, {
				brand: esc(cfg.fromName || name),
				heading: 'Reset your password',
				body:
					para(esc(hi)) +
					para(`Someone asked to reset the password of your account at ${esc(name)}. To choose a new one, use the button within an hour.`) +
					para('If it wasn’t you, ignore this email — your password stays as it is.'),
				button: { href: link, text: 'Choose a new password' },
			}),
		},
		{ organization: project.organization, project: project._id, kind: 'customer-reset' },
		cfg
	).catch(() => undefined); // logged as failed on the project's Email page
};

/** Sets the password a reset link allows, signs every other device out, and returns the account (signed in). */
export const resetPassword = async (app: any, project: any, token: string, password: string) => {
	const invalid = () => new TenancyError(400, 'This link has expired or was already used — ask for a new one.', 'reset_invalid');
	let claims: any;
	try {
		claims = jwt.verify(String(token || ''), secret());
	} catch {
		throw invalid();
	}
	if (claims?.kind !== RESET_TOKEN_KIND || claims.project !== String(project._id)) throw invalid();
	const row: any = await ProjectCustomer.findById(claims._id).select('+password');
	if (!row || row.isActive === false || (row.tokenVersion || 0) !== (claims.v || 0)) throw invalid();
	if (!(await currentAccount(app, project, row.toObject()))) throw invalid();
	row.password = password;
	row.tokenVersion = (row.tokenVersion || 0) + 1;
	row.lastLoginAt = new Date();
	await row.save();
	await linkCustomerRecord(app, project, row);
	return row;
};
