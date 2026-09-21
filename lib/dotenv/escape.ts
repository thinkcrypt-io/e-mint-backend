/**
 * Quoting for a generated `.env` file.
 *
 * Shared by the Heroku config-var download and the Vercel environment
 * download. It lives here rather than in either provider's folder because the
 * rules below are dotenv's, not Heroku's or Vercel's, and one hard-won copy is
 * better than two that drift.
 *
 * The folder is `dotenv/` and not `env/` on purpose: `.gitignore` carries a
 * bare `env` rule, which matches a *directory* of that name anywhere in the
 * tree. A `lib/env/` here was silently untracked — it type-checked and built
 * locally and would have broken the first clean clone, since two provider
 * modules import from it.
 */

/**
 * Quoted only when it has to be, and single-quoted by preference.
 *
 * dotenv's two quoting modes are not symmetrical, which is the whole reason
 * this is more than a one-liner (verified against dotenv 16.4.5, the version
 * installed here):
 *
 * - Single quotes are fully literal. A `"`, a `#`, a backslash and even a real
 *   newline all survive untouched. Only a `'` cannot appear inside.
 * - Double quotes unescape `\n` and `\r` — and *nothing else*. In particular
 *   `\"` is NOT unescaped, so a `"` inside a double-quoted value comes back
 *   with its backslash still attached.
 *
 * So single quotes are the default, and double quotes are the fallback for the
 * one case they cannot express. A value containing both `'` and `"` lands in
 * the double-quoted branch and survives only because dotenv's matcher is greedy
 * to the last quote on the line — true for the cases tested, but incidental
 * rather than guaranteed. A JSON download is lossless for every input, and is
 * what the UI should point at when a value is unusual.
 */
export const escapeEnvValue = (value: string): string => {
	if (value === '') return '';
	if (!/[\s"'#\\]/.test(value)) return value;

	if (!value.includes("'")) return `'${value}'`;

	return `"${value.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
};
