import ModelDefinition from '../models/builder/modelDefinition.model.js';
import SiteWidgets from '../models/tenancy/siteWidgets.model.js';
import ProjectCustomer from '../models/tenancy/projectCustomer.model.js';
import { runInScope } from './tenantScope.function.js';
import { compiledModel, syncDynamicModels } from './dynamicModels.function.js';
import { fireWebhooks } from './webhooks.function.js';
import { fireAutomations } from './automations.function.js';
import { shopModels } from './shop.function.js';
import { TenancyError } from './tenancy.function.js';
import { forgetPublicWidgets } from './widgets.function.js';

/**
 * Login & account's customer model (docs/widgets W-24, decision WD12). MINT's
 * own Customers (ProjectCustomer) is the default; a project can name one of
 * its own models and which of its fields are the email, name and phone, in
 * one of two ways (`accounts`):
 *
 *  - `mint` — accounts stay in MINT's Customers and each gets a linked copy in
 *    the model: on sign-up (or the first sign-in after the model is chosen)
 *    the record with the same email is linked, or a new one is made; a name or
 *    phone change on the site is copied onto it.
 *  - `model` — the model holds the accounts: every sign-up is a record there,
 *    the record's email is what signs in, and removing (or archiving) the
 *    record ends the account. Records the team adds have no password and
 *    can't sign in (or be claimed by signing up with their email).
 *
 * Either way the password (hashed), staying signed in and signing out
 * everywhere live in a ProjectCustomer row linked by `record` — in `model`
 * mode marked `holder: 'model'` and left off MINT's Customers page. Nothing
 * secret is ever written to a tenant's model.
 *
 * Only a model switched on for it can be chosen — its Advanced tab → Sign-in,
 * `ModelDefinition.signIn.enabled` (W-25) — and it can't be switched off
 * while chosen (models.controller).
 *
 * A project has one sign-in model (W-26, the user 2026-10-19: "one sign-in
 * model per project plus a role field"; then: "it should be customer role, not
 * the user role we have" — the team's roles are another thing). Its optional
 * customer role field (`fields.role`, an options field) tells kinds of people
 * apart: sign-ups get its default, the public API never writes it, and
 * endpoints for signed-in customers may admit only some customer roles
 * (`ApiEndpoint.access.customerRoles`). It's read from their record on every
 * call (`customerRole`), so a change by the team counts at once.
 *
 * Saved in `SiteWidgets.auth`; checked against today's models on every read,
 * like the shop (a field since removed makes it null — accounts keep working,
 * only the copying stops).
 */

export type AuthMapping = {
	model: string;
	accounts: 'mint' | 'model';
	fields: { email: string; name?: string; phone?: string; role?: string };
	/** W-27: customer roles people may sign up as themselves (a role login's sign-up); the default role always may. */
	signUpRoles?: string[];
};

/** What each part may be — the panel's CustomersStep keeps the same list. */
export const AUTH_KINDS: Record<keyof AuthMapping['fields'], string[]> = {
	email: ['email', 'text'],
	name: ['text'],
	phone: ['text'],
	/** W-26: an options field — its options are the roles, its default is every sign-up's. */
	role: ['select'],
};
const PARTS: (keyof AuthMapping['fields'])[] = ['email', 'name', 'phone', 'role'];
const PART_NAMES = { email: 'email', name: 'name', phone: 'phone', role: 'role' };

const scopeOf = (project: any) => ({ organization: project.organization, project: project._id });
const activeDefs = () => ModelDefinition.find({ active: { $ne: false } }).lean();

/** The mapping as saved: the model is one of the project's lists, the email is required, every field fits. */
export const checkAuth = (raw: any, defs: any[]): AuthMapping => {
	const name = String(raw?.model || '').trim();
	if (!name) throw new TenancyError(400, 'Pick the model that holds your customers.');
	const def = defs.find(d => d.name === name);
	if (!def) throw new TenancyError(400, `There's no “${name}” model.`);
	if (def.kind === 'single') throw new TenancyError(400, `${def.title || def.name} holds one record, not a list — pick a model with a record per customer.`);
	// Only a model the builder opened to accounts (W-25): Models → it → Advanced → Sign-in.
	if (!def.signIn?.enabled)
		throw new TenancyError(400, `${def.title || def.name} isn’t open to sign-in — switch on “People can sign up and sign in” on its Advanced tab (Models → ${def.title || def.name} → Advanced) first.`);
	const fields: any = {};
	for (const part of PARTS) {
		const key = String(raw?.fields?.[part] || '').trim();
		if (!key) {
			if (part === 'email') throw new TenancyError(400, `Pick ${def.title || def.name}’s email field — it’s how an account finds its record.`);
			continue;
		}
		const f = (def.fields || []).find((x: any) => x.key === key);
		if (!f) throw new TenancyError(400, `${def.title || def.name} has no “${key}” field.`);
		if (!AUTH_KINDS[part].includes(f.kind))
			throw new TenancyError(400, `The customer’s ${PART_NAMES[part]} needs a ${AUTH_KINDS[part].join(' or ')} field — “${f.label || key}” is ${f.kind}.`);
		fields[part] = key;
	}
	// A record is made from the sign-up form alone: a required field it doesn't fill would refuse every sign-up's record.
	// The role isn't on the form (W-26): sign-ups get its default, so a required role needs one.
	const mapped = new Set(Object.entries(fields).filter(([part]) => part !== 'role').map(([, key]) => key));
	const blocking = (def.fields || []).filter((f: any) => f.required && !mapped.has(f.key) && (f.default === undefined || f.default === null || f.default === ''));
	if (blocking.length)
		throw new TenancyError(
			400,
			`${def.title || def.name} has required fields sign-up can’t fill (${blocking.map((f: any) => f.label || f.key).join(', ')}) — make them optional or give them a default first.`
		);
	// Customer roles people may sign up as themselves (W-27): options of the role field.
	let signUpRoles: string[] = [];
	if (fields.role && Array.isArray(raw?.signUpRoles)) {
		const options = ((def.fields || []).find((x: any) => x.key === fields.role)?.options || []).map((o: any) => String(o.value));
		signUpRoles = [...new Set<string>(raw.signUpRoles.map((r: any) => String(r)))].filter(r => options.includes(r));
	}
	return { model: def.name, accounts: raw?.accounts === 'model' ? 'model' : 'mint', fields, signUpRoles };
};

/** A model that looks like customers (Customer, Client, Member…) with an email field, to start from. */
const guessAuth = (defs: any[]): AuthMapping | null => {
	const def =
		defs.find(d => /^customers?$/i.test(d.name)) ||
		defs.find(d => /customer|client|member|account|user|contact/i.test(d.name) && (d.fields || []).some((f: any) => AUTH_KINDS.email.includes(f.kind) && /e-?mail/i.test(f.key)));
	if (!def || def.kind === 'single') return null;
	const pick = (kinds: string[], re: RegExp) => (def.fields || []).find((f: any) => kinds.includes(f.kind) && re.test(f.key))?.key;
	const email = pick(AUTH_KINDS.email, /e-?mail/i);
	if (!email) return null;
	const out: AuthMapping = { model: def.name, accounts: 'mint', fields: { email } };
	const name = pick(AUTH_KINDS.name, /^(name|full_?name|customer_?name)$/i);
	const phone = pick(AUTH_KINDS.phone, /phone|mobile/i);
	const role = pick(AUTH_KINDS.role, /role/i);
	if (name) out.fields.name = name;
	if (phone) out.fields.phone = phone;
	if (role) out.fields.role = role;
	try {
		return checkAuth(out, defs);
	} catch {
		return null;
	}
};

/** The saved mapping, checked against today's models, or null. */
export const loadAuth = async (project: any): Promise<AuthMapping | null> => {
	const [doc, defs]: any[] = await runInScope(scopeOf(project), () => Promise.all([SiteWidgets.findOne({}, { auth: 1 }).lean(), activeDefs()]));
	if (!doc?.auth) return null;
	try {
		return checkAuth(doc.auth, defs);
	} catch {
		return null;
	}
};

/** The panel's view: the saved mapping (and why it no longer works, if so), a suggestion, the models. */
export const authView = async (project: any) => {
	const [doc, defs]: any[] = await runInScope(scopeOf(project), () => Promise.all([SiteWidgets.findOne({}, { auth: 1 }).lean(), activeDefs()]));
	let auth: AuthMapping | null = null;
	let problem: string | null = null;
	if (doc?.auth)
		try {
			auth = checkAuth(doc.auth, defs);
		} catch (e: any) {
			problem = e.message;
		}
	const lists = defs.filter((d: any) => d.kind !== 'single');
	// Only models switched on for sign-in are offered (W-25); `closed` says how many others there are.
	const open = lists.filter((d: any) => d.signIn?.enabled);
	return { auth, saved: doc?.auth || null, problem, guess: guessAuth(open), models: shopModels(open), closed: lists.length - open.length };
};

/** Saves the mapping (checked) — or clears it with null: accounts stay in MINT's Customers only. */
export const saveAuth = async (project: any, body: any) => {
	let auth: AuthMapping | null = null;
	if (body?.auth !== null) {
		const defs: any[] = await runInScope(scopeOf(project), () => activeDefs());
		auth = checkAuth(body?.auth, defs);
	}
	await runInScope(scopeOf(project), async () => {
		await SiteWidgets.updateOne({}, { $set: { auth } }, { upsert: true });
		// Out of `model` mode, accounts the model held become MINT customers again (their record stays linked as a copy).
		if (auth?.accounts !== 'model') await ProjectCustomer.updateMany({ holder: 'model' }, { $unset: { holder: 1 } });
	});
	forgetPublicWidgets(project); // the site's login reads the customer roles (W-27)
	return authView(project);
};

/* ------------------------------------------- the account's record (public API) */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The chosen model, compiled, and its definition — or null (none chosen, or it's gone). Runs in the project's scope. */
const customerModel = async (app: any, project: any) => {
	const m = await loadAuth(project);
	if (!m) return null;
	await syncDynamicModels({ app });
	const def: any = await ModelDefinition.findOne({ name: m.model, active: { $ne: false } }).lean();
	const Model = def && compiledModel(def.name);
	return Model ? { m, def, Model } : null;
};

/**
 * Links a signed-up or signed-in customer to their record in the chosen model
 * — the one with their email, or a new one — and returns its id (null when no
 * model is chosen). Never stops a sign-in: a record that can't be made is
 * logged and skipped, and tried again on the next sign-in.
 */
export const linkCustomerRecord = async (app: any, project: any, customer: any, opts: { customerRole?: string } = {}): Promise<string | null> => {
	try {
		const c = await customerModel(app, project);
		if (!c) return null;
		const { m, def, Model } = c;
		if (customer.holder === 'model') return customer.record ? String(customer.record) : null;
		// While the model holds the accounts, older MINT accounts stay MINT customers — a copy would look like one it holds.
		if (m.accounts === 'model') return customer.record ? String(customer.record) : null;
		if (customer.record && customer.recordModel === m.model && (await Model.exists({ _id: customer.record }))) return String(customer.record);
		let doc: any = await Model.findOne({ [m.fields.email]: new RegExp(`^${escape(String(customer.email))}$`, 'i') });
		const made = !doc;
		if (!doc) {
			doc = new Model({
				[m.fields.email]: customer.email,
				// A role login's sign-up (W-27): its customer role, already checked as one people may sign up as.
				...(m.fields.role && opts.customerRole && { [m.fields.role]: opts.customerRole }),
				...(m.fields.name && customer.name && { [m.fields.name]: customer.name }),
				...(m.fields.phone && customer.phone && { [m.fields.phone]: customer.phone }),
				// Owner-only endpoints let the customer reach their own record (the path exists when the model's public API is on).
				_customer: customer._id,
				...(def.access?.enabled && { privacy: 'public' }),
			});
			await doc.save();
			fireWebhooks({ route: def.route, event: 'create', doc, source: 'api' });
			fireAutomations({ route: def.route, event: 'create', doc, actor: { name: 'Sign-up' } });
		}
		// A record that was already there (the team's) is linked, never handed over: emails aren't verified, so
		// signing up with someone's email mustn't give owner-only access to their record.
		await ProjectCustomer.updateOne({ _id: customer._id }, { $set: { record: doc._id, recordModel: m.model, recordMade: made } });
		customer.record = doc._id;
		customer.recordModel = m.model;
		customer.recordMade = made;
		return String(doc._id);
	} catch (e: any) {
		console.warn(`[widgets] couldn't link customer ${customer?._id} to their record:`, e?.message);
		return null;
	}
};

/** A signed-in customer changed their name or phone on the site: the same change on their record. */
export const syncCustomerRecord = async (app: any, project: any, customer: any, patch: { name?: string; phone?: string }) => {
	try {
		const c = await customerModel(app, project);
		if (!c || !customer.record || customer.recordModel !== c.m.model) return;
		const set: any = {};
		if (c.m.fields.name && patch.name !== undefined) set[c.m.fields.name] = patch.name;
		if (c.m.fields.phone && patch.phone !== undefined) set[c.m.fields.phone] = patch.phone;
		if (!Object.keys(set).length) return;
		const doc: any = await c.Model.findByIdAndUpdate(customer.record, { $set: set }, { new: true });
		if (doc) {
			fireWebhooks({ route: c.def.route, event: 'update', doc, source: 'api' });
			fireAutomations({ route: c.def.route, event: 'update', doc, actor: { name: customer.name || 'Customer' } });
		}
	} catch (e: any) {
		console.warn(`[widgets] couldn't update customer ${customer?._id}'s record:`, e?.message);
	}
};

/* ------------------------------------------- the model holds the accounts */

const byEmail = (field: string, email: string) => ({ [field]: new RegExp(`^${escape(String(email).trim())}$`, 'i'), archivedAt: null });

/** The model and mapping when the model holds the accounts (`accounts: 'model'`), or null. */
export const accountsModel = async (app: any, project: any) => {
	const c = await customerModel(app, project);
	return c && c.m.accounts === 'model' ? c : null;
};

/**
 * Sign-up when the model holds the accounts: the record first (mapped fields,
 * the model's defaults, `_customer` so owner-only endpoints reach it), then
 * its sign-in row. An email already in the model — an account, or a record the
 * team added — is refused.
 */
export const registerInModel = async (
	c: NonNullable<Awaited<ReturnType<typeof accountsModel>>>,
	body: { name: string; email: string; phone?: string; password: string },
	opts: { customerRole?: string } = {}
) => {
	const { m, def, Model } = c;
	if ((await Model.exists(byEmail(m.fields.email, body.email))) || (await ProjectCustomer.exists({ email: body.email })))
		throw new TenancyError(400, 'An account with this email exists — sign in instead.', 'email_taken');
	const customer: any = new ProjectCustomer({ ...body, holder: 'model', recordModel: m.model, recordMade: true, lastLoginAt: new Date() });
	const doc: any = new Model({
		[m.fields.email]: body.email,
		...(m.fields.name && body.name && { [m.fields.name]: body.name }),
		...(m.fields.phone && body.phone && { [m.fields.phone]: body.phone }),
		...(m.fields.role && opts.customerRole && { [m.fields.role]: opts.customerRole }),
		_customer: customer._id,
		...(def.access?.enabled && { privacy: 'public' }),
	});
	try {
		await doc.save();
	} catch (e: any) {
		const first: any = e?.name === 'ValidationError' ? Object.values(e.errors || {})[0] : null;
		throw new TenancyError(409, `The account couldn’t be made${first?.message ? `: ${first.message}` : ''}.`, 'account_invalid');
	}
	customer.record = doc._id;
	try {
		await customer.save();
	} catch (e) {
		await Model.deleteOne({ _id: doc._id });
		throw e;
	}
	fireWebhooks({ route: def.route, event: 'create', doc, source: 'api' });
	fireAutomations({ route: def.route, event: 'create', doc, actor: { name: 'Sign-up' } });
	return { customer, def, record: doc };
};

/** Sign-in when the model holds the accounts: the record with this email, then its sign-in row (with the password). */
export const accountByEmail = async (c: NonNullable<Awaited<ReturnType<typeof accountsModel>>>, email: string) => {
	const doc: any = await c.Model.findOne(byEmail(c.m.fields.email, email), { _id: 1 }).lean();
	if (!doc) return null;
	return ProjectCustomer.findOne({ record: doc._id, holder: 'model' }).select('+password');
};

/**
 * A signed-in account the model holds, as it is now: its name, email and
 * phone from the record (the team may have changed them), or null when the
 * record was removed or archived — the account is gone. Accounts MINT holds
 * pass through.
 */
export const currentAccount = async (app: any, project: any, customer: any) => {
	if (customer?.holder !== 'model') return customer;
	const c = await accountsModel(app, project);
	if (!c || c.m.model !== customer.recordModel) return customer;
	const doc: any = await c.Model.findOne({ _id: customer.record, archivedAt: null }).lean();
	if (!doc) return null;
	const text = (k?: string) => (k && typeof doc[k] === 'string' ? doc[k] : undefined);
	return { ...customer, email: text(c.m.fields.email)?.toLowerCase() || customer.email, name: text(c.m.fields.name) || customer.name, phone: text(c.m.fields.phone) ?? customer.phone };
};

/* ------------------------------------------------------------ roles (W-26) */

/** The customer roles signed-in endpoints can admit: the sign-in model's Customer role field and its options — or null without one. */
export const signInRoles = async (project: any) => {
	const m = await loadAuth(project);
	if (!m?.fields.role) return null;
	const def: any = await runInScope(scopeOf(project), () => ModelDefinition.findOne({ name: m.model, active: { $ne: false } }).lean());
	const f = (def?.fields || []).find((x: any) => x.key === m.fields.role);
	if (!f) return null;
	return {
		model: def.name,
		modelTitle: def.title || def.name,
		route: def.route,
		field: f.key,
		fieldLabel: f.label || f.key,
		default: f.default ?? null,
		// `signUp`: people may sign up as it themselves (W-27) — the default always, others when the project allows.
		roles: (f.options || []).map((o: any) => ({
			value: String(o.value),
			label: o.label || String(o.value),
			signUp: String(o.value) === String(f.default ?? '') || (m.signUpRoles || []).includes(String(o.value)),
		})),
	};
};

/**
 * The customer's role, as their record has it now — or null (no Customer role field
 * mapped, no record, none set, or a record their sign-up didn't make).
 */
export const customerRole = async (app: any, project: any, customer: any): Promise<string | null> => {
	try {
		const c = await customerModel(app, project);
		if (!c?.m.fields.role || !customer?.record || customer.recordModel !== c.m.model) return null;
		// Only a record the account's own sign-up made: one the team had (linked by an unverified email) grants nothing.
		if (!customer.recordMade && customer.holder !== 'model') return null;
		const doc: any = await c.Model.findOne({ _id: customer.record, archivedAt: null }, { [c.m.fields.role]: 1 }).lean();
		const v = doc?.[c.m.fields.role];
		return v === undefined || v === null || v === '' ? null : String(v);
	} catch {
		return null;
	}
};

/** The fields of `def` the public API must never write: the sign-in model's customer role (a customer can't promote themselves). */
export const signInLocked = async (project: any, def: any): Promise<string[]> => {
	const m = await loadAuth(project);
	return m && m.model === def.name && m.fields.role ? [m.fields.role] : [];
};

/**
 * A role login's customer role (W-27), checked: one of the Customer role
 * field's options — and, for a sign-up, one people may sign up as themselves.
 * Returns the option, or throws.
 */
export const checkCustomerRole = async (project: any, value: string, forSignUp: boolean) => {
	const info = await signInRoles(project);
	const role = info?.roles.find((r: any) => r.value === value);
	if (!info || !role) throw new TenancyError(400, `“${value}” isn’t a customer role of this site.`, 'customer_role_unknown');
	if (forSignUp && !role.signUp)
		throw new TenancyError(403, `You can’t sign up as ${role.label} here — ${role.label} accounts are made by the team.`, 'customer_role_closed');
	return role;
};

