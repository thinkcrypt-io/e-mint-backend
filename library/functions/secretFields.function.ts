import { Schema } from 'mongoose';
import { isSealed, open, seal } from '../../lib/crypto/secret.js';

/**
 * A built model's Password fields (kind `password`): a value people must be
 * able to read back — a client's portal login, a Wi-Fi key — so it's
 * encrypted (AES-256-GCM, lib/crypto/secret.ts), not hashed.
 *
 * The path is `select: false` with `secret: true`. This plugin keeps it that
 * way everywhere a record goes:
 * - written: sealed on save, insertMany (bulk import) and update queries
 *   (bulk edits); a blank value on an existing record keeps the stored one —
 *   the edit form never has it, so it always submits blank;
 * - read: a projection naming it (`?fields=` on a list) is stripped unless the
 *   query sets `revealSecrets` — only the reveal endpoint does, after the
 *   person re-enters their own password (crud/revealSecret.controller.ts);
 * - sent: never in a JSON response, even as ciphertext.
 */

/** The model's secret paths. */
export const secretPaths = (schema: Schema): string[] =>
	Object.keys((schema as any).paths).filter(p => (schema as any).paths[p]?.options?.secret);

export const isSecretPath = (schema: Schema, path: string) => !!(schema.path(path) as any)?.options?.secret;

const blank = (v: any) => v === undefined || v === null || v === '';
const sealValue = (v: any) => (isSealed(v) ? v : seal(String(v)));

/** The stored value, readable — older plain values (none yet) pass through. */
export const openSecret = (stored: any): string => (blank(stored) ? '' : isSealed(stored) ? open(stored) : String(stored));

export const secretFieldsPlugin = (schema: Schema) => {
	const keys = secretPaths(schema);
	if (!keys.length) return;

	schema.pre('save', function (this: any) {
		for (const k of keys) {
			if (!this.isModified(k)) continue;
			const v = this.get(k);
			if (blank(v)) {
				if (this.isNew) this.set(k, undefined);
				else this.unmarkModified(k);
			} else this.set(k, sealValue(v));
		}
	});

	schema.pre('insertMany', function (next: any, docs: any) {
		try {
			for (const d of Array.isArray(docs) ? docs : [docs])
				for (const k of keys)
					if (d && k in d) {
						if (blank(d[k])) delete d[k];
						else d[k] = sealValue(d[k]);
					}
			next();
		} catch (e) {
			next(e);
		}
	});

	const fixUpdate = (u: any) => {
		if (!u || typeof u !== 'object') return;
		for (const k of keys)
			if (k in u) {
				if (blank(u[k])) delete u[k];
				else u[k] = sealValue(u[k]);
			}
	};
	schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (this: any) {
		const u = this.getUpdate();
		if (Array.isArray(u)) return; // a pipeline update — nothing here writes one
		fixUpdate(u);
		fixUpdate(u?.$set);
		fixUpdate(u?.$setOnInsert);
	});

	schema.pre(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace'], function (this: any) {
		if (this.getOptions()?.revealSecrets) return;
		const p = this.projection();
		if (!p || typeof p !== 'object') return;
		for (const k of keys) {
			if (p[k]) delete p[k];
			delete p[`+${k}`];
		}
	});

	const prev: any = schema.get('toJSON') || {};
	schema.set('toJSON', {
		...prev,
		transform(doc: any, ret: any, options: any) {
			const out = typeof prev.transform === 'function' ? prev.transform(doc, ret, options) ?? ret : ret;
			for (const k of keys) delete out[k];
			return out;
		},
	});
};
