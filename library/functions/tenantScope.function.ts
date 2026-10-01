import { AsyncLocalStorage } from 'async_hooks';
import mongoose, { Schema } from 'mongoose';

/**
 * Which tenant a request works for (docs/multi-tenancy, D4/D5).
 *
 * The builder's metadata collections (model definitions, route settings and
 * configs, sidebar, dashboard, API keys, built features) hold the super
 * admin's documents and every tenant's side by side; a tenant document carries
 * `organization` and, under a project, `project`. The `tenantScoped` plugin
 * below adds the current scope to every query and stamps it on every insert,
 * so the controllers that read these collections need no tenant code at all:
 *
 * - inside `runInScope({ organization, project })` (tenant requests) a query
 *   only sees that organization's (and project's) documents;
 * - with no scope (the super-admin panel, boot, scripts) a query only sees
 *   documents with no organization — tenants' never leak in;
 * - inside `runUnscoped()` nothing is added — for system work that must see
 *   everything (migrations, the super-admin oversight pages' counts).
 *
 * `AsyncLocalStorage` follows the request through every await, so the scope
 * set by the project router's middleware is the one the controllers' queries
 * see. Code that must not inherit the caller's scope (the super-admin model
 * registry sync, which can be triggered from inside a tenant request) runs
 * through `withoutScope`.
 */

export type TenantScope = {
	organization: mongoose.Types.ObjectId;
	/** Absent for organization-level work (members, projects list…). */
	project?: mongoose.Types.ObjectId | null;
};

type Store = { scope: TenantScope | null; unscoped?: boolean };

const storage = new AsyncLocalStorage<Store>();

const toId = (v: any) => (v == null ? null : v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));

/**
 * A Mongoose Query or Aggregate runs when it's awaited — which would be
 * outside the scope if `fn` merely returned it. Execute it inside instead.
 */
const settle = <T>(fn: () => T) => (): T => {
	const out: any = fn();
	return out && typeof out.exec === 'function' && typeof out.then === 'function' ? out.exec() : out;
};

/** Runs `fn` (and everything it awaits) as the given tenant. */
export const runInScope = <T>(scope: TenantScope, fn: () => T): T =>
	storage.run({ scope: { organization: toId(scope.organization)!, project: toId(scope.project) } }, settle(fn));

/** Runs `fn` seeing every tenant's documents and the super admin's alike. */
export const runUnscoped = <T>(fn: () => T): T => storage.run({ scope: null, unscoped: true }, settle(fn));

/** Runs `fn` as the super admin (no tenant), whatever the caller's scope. */
export const withoutScope = <T>(fn: () => T): T => storage.exit(settle(fn));

/** Express middleware: the rest of the request runs in the scope `scopeOf(req)` returns. */
export const scopeMiddleware =
	(scopeOf: (req: any) => TenantScope | null) => (req: any, _res: any, next: any) => {
		const scope = scopeOf(req);
		if (!scope) return next();
		req.tenantScope = scope;
		runInScope(scope, () => next());
	};

/** The tenant this code runs for, or null for the super admin / system. */
export const currentScope = (): TenantScope | null => storage.getStore()?.scope || null;

export const isUnscoped = () => !!storage.getStore()?.unscoped;

/** Short key for caches that must not mix tenants: 'admin', or the project/org id. */
export const scopeKey = (): string => {
	const s = currentScope();
	if (!s) return 'admin';
	return s.project ? `p:${s.project}` : `o:${s.organization}`;
};

/**
 * The filter the plugin adds: a tenant's own documents, or the super admin's
 * (no organization). `null` matches a missing field, so documents written
 * before tenancy existed stay the super admin's.
 */
export const scopeFilter = (): Record<string, any> | null => {
	if (isUnscoped()) return null;
	const s = currentScope();
	if (!s) return { organization: null };
	return { organization: s.organization, project: s.project || null };
};

const QUERY_OPS = [
	'find',
	'findOne',
	'findOneAndUpdate',
	'findOneAndDelete',
	'findOneAndReplace',
	'countDocuments',
	'distinct',
	'updateOne',
	'updateMany',
	'replaceOne',
	'deleteOne',
	'deleteMany',
] as const;

export class ScopeError extends Error {
	status = 404;
	constructor(message = 'Not found') {
		super(message);
	}
}

/**
 * Adds `organization` and `project` to a schema and confines every query,
 * aggregate, save and insertMany to the current scope (see the file comment).
 */
export const tenantScoped = (schema: Schema) => {
	schema.add({
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
		project: { type: Schema.Types.ObjectId, ref: 'TenantProject', index: true },
	});

	for (const op of QUERY_OPS)
		schema.pre(op as any, { query: true, document: false } as any, function (this: any) {
			const filter = scopeFilter();
			if (filter) this.where(filter);
		});

	schema.pre('aggregate', function (this: any) {
		const filter = scopeFilter();
		if (filter) this.pipeline().unshift({ $match: filter });
	});

	const stamp = (doc: any) => {
		if (isUnscoped()) return;
		const s = currentScope();
		if (doc.isNew) {
			if (s) {
				doc.organization = s.organization;
				doc.project = s.project || undefined;
			} else if (doc.organization) throw new ScopeError(); // the super admin can't write a tenant's
			return;
		}
		// An existing document is only ever saved by its own scope.
		const same =
			String(doc.organization || '') === String(s?.organization || '') &&
			String(doc.project || '') === String(s?.project || '');
		if (!same) throw new ScopeError();
	};

	schema.pre('save', function (this: any) {
		stamp(this);
	});

	schema.pre('insertMany', function (this: any, next: any, docs: any) {
		try {
			const list = Array.isArray(docs) ? docs : [docs];
			const s = currentScope();
			if (!isUnscoped())
				for (const d of list) {
					if (!s) {
						if (d?.organization) throw new ScopeError();
					} else {
						d.organization = s.organization;
						d.project = s.project || undefined;
					}
				}
			next();
		} catch (e) {
			next(e);
		}
	});
};
