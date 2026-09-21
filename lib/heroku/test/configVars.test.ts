import dotenv from 'dotenv';
import { toEnvFile, toJsonFile } from '../configVars.js';

/**
 * The contract here is a round trip, not a string match: whatever `toEnvFile`
 * writes has to come back out of a real .env parser byte-identical. Asserting
 * on the emitted text instead would have happily locked in the original bug,
 * where `KEY="say \"hi\""` looked plausible and parsed back wrong.
 */
const roundTrip = (vars: Record<string, string | null>) =>
	dotenv.parse(toEnvFile('demo-app', vars));

describe('toEnvFile', () => {
	it('round-trips values through dotenv unchanged', () => {
		const vars = {
			SIMPLE: 'abc123',
			SPACED: 'hello world',
			// The regression: dotenv unescapes \n and \r inside double quotes but
			// never \", so the old double-quote-and-escape approach corrupted these.
			QUOTED: 'say "hi"',
			APOS: "it's",
			HASHED: 'a#b',
			EMPTY: '',
			// Single-quoted and literal, so the backslashes stay backslashes. Under
			// double quotes the trailing \n would have become a real newline.
			BACKSLASH: 'C:\\path\\n',
			MULTI: '-----BEGIN KEY-----\nline2\nline3\n-----END KEY-----',
		};

		expect(roundTrip(vars)).toEqual(vars);
	});

	it('treats a null value as empty rather than the string "null"', () => {
		expect(roundTrip({ NULLV: null })).toEqual({ NULLV: '' });
	});

	it('sorts keys so two downloads of one app are diffable', () => {
		const body = toEnvFile('demo-app', { ZED: 'z', ALPHA: 'a', MID: 'm' })
			.split('\n')
			.filter(line => line && !line.startsWith('#'));

		expect(body).toEqual(['ALPHA=a', 'MID=m', 'ZED=z']);
	});

	it('keeps a multi-line value on one logical entry', () => {
		const parsed = roundTrip({ PEM: 'a\nb', AFTER: 'still-parsed' });

		// The newline must not end the entry early and orphan what follows it.
		expect(parsed.PEM).toBe('a\nb');
		expect(parsed.AFTER).toBe('still-parsed');
	});

	it('marks the file as secret in its header', () => {
		expect(toEnvFile('demo-app', { A: 'b' })).toContain('do not commit');
	});
});

describe('toJsonFile', () => {
	it('is lossless for values .env cannot express cleanly', () => {
		const vars = { BOTH: 'it\'s "quoted"', MULTI: 'a\nb' };

		expect(JSON.parse(toJsonFile(vars))).toEqual(vars);
	});

	it('normalises a null value to an empty string, as the .env form does', () => {
		expect(JSON.parse(toJsonFile({ NULLV: null }))).toEqual({ NULLV: '' });
	});
});
