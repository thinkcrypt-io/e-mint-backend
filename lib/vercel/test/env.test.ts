import dotenv from 'dotenv';
import {
	diffEnv,
	envIdentity,
	toEnvRecord,
	toEnvFile,
	toJsonFile,
	forTarget,
	VercelEnvRecord,
} from '../env.js';

const record = (over: Partial<VercelEnvRecord>): VercelEnvRecord => ({
	id: 'id_' + Math.random().toString(36).slice(2, 8),
	key: 'KEY',
	type: 'encrypted',
	target: ['production'],
	gitBranch: null,
	comment: null,
	value: 'value',
	readable: true,
	revealable: true,
	createdAt: null,
	updatedAt: null,
	...over,
});

describe('envIdentity', () => {
	it('separates the same key on different targets', () => {
		// The trap this exists to prevent: keying on `key` alone merges the
		// production and preview records, so the diff reports one change and the
		// write then touches two.
		const production = record({ key: 'DATABASE_URL', target: ['production'] });
		const preview = record({ key: 'DATABASE_URL', target: ['preview'] });

		expect(envIdentity(production)).not.toBe(envIdentity(preview));
	});

	it('is order-independent across targets', () => {
		const a = record({ key: 'API', target: ['production', 'preview'] });
		const b = record({ key: 'API', target: ['preview', 'production'] });

		expect(envIdentity(a)).toBe(envIdentity(b));
	});

	it('separates a branch-pinned preview var from a general one', () => {
		const general = record({ key: 'API', target: ['preview'] });
		const pinned = record({ key: 'API', target: ['preview'], gitBranch: 'staging' });

		expect(envIdentity(general)).not.toBe(envIdentity(pinned));
	});
});

describe('diffEnv', () => {
	it('reports one change per target, not per record', () => {
		const existing: VercelEnvRecord[] = [];
		const changes = diffEnv(existing, [
			{ key: 'API_URL', value: 'https://api', target: ['production', 'preview'] },
		]);

		expect(changes).toHaveLength(2);
		expect(changes.map(c => c.target).sort()).toEqual(['preview', 'production']);
		expect(changes.every(c => c.kind === 'added')).toBe(true);
	});

	it('reports two changes when one key changes on two targets', () => {
		const prod = record({ id: 'p', key: 'DATABASE_URL', target: ['production'], value: 'old-prod' });
		const prev = record({ id: 'v', key: 'DATABASE_URL', target: ['preview'], value: 'old-prev' });

		const changes = diffEnv(
			[prod, prev],
			[
				{ id: 'p', key: 'DATABASE_URL', value: 'new-prod', target: ['production'] },
				{ id: 'v', key: 'DATABASE_URL', value: 'new-prev', target: ['preview'] },
			]
		);

		expect(changes).toHaveLength(2);
		expect(changes.every(c => c.kind === 'updated')).toBe(true);
	});

	it('does not report an unchanged value as updated', () => {
		const existing = record({ id: 'p', key: 'STABLE', value: 'same' });
		const changes = diffEnv([existing], [{ id: 'p', key: 'STABLE', value: 'same', target: ['production'] }]);

		expect(changes).toHaveLength(0);
	});

	it('treats anything absent from the staged set as removed', () => {
		const existing = record({ id: 'gone', key: 'OLD_FLAG' });
		const changes = diffEnv([existing], []);

		expect(changes).toEqual([
			{ key: 'OLD_FLAG', target: 'production', gitBranch: '', kind: 'removed' },
		]);
	});

	it('never reports a sensitive var as updated unless a replacement was supplied', () => {
		// A sensitive value cannot be read back, so there is nothing to compare.
		// Without this, every save would report every sensitive var as changed.
		const secret = record({
			id: 's',
			key: 'STRIPE_KEY',
			type: 'sensitive',
			value: null,
			readable: false,
			revealable: false,
		});

		expect(diffEnv([secret], [{ id: 's', key: 'STRIPE_KEY', target: ['production'] }])).toHaveLength(0);
		expect(
			diffEnv([secret], [{ id: 's', key: 'STRIPE_KEY', value: 'sk_new', target: ['production'] }])
		).toHaveLength(1);
	});

	it('carries the branch onto the change row', () => {
		const changes = diffEnv([], [
			{ key: 'API', value: 'x', target: ['preview'], gitBranch: 'staging' },
		]);

		expect(changes[0].gitBranch).toBe('staging');
	});

	it('never puts a value in a change row', () => {
		const changes = diffEnv([record({ id: 'a', key: 'SECRET', value: 'before' })], [
			{ id: 'a', key: 'SECRET', value: 'after', target: ['production'] },
		]);

		const serialised = JSON.stringify(changes);
		expect(serialised).not.toContain('before');
		expect(serialised).not.toContain('after');
	});
});

describe('the encrypted envelope a list read returns', () => {
	// Confirmed against the live account: `?decrypt=true` on the list hands back
	// a base64 `{"v":"v2","c":"..."}` blob about a kilobyte long, not the value.
	const envelope = Buffer.from(
		JSON.stringify({ v: 'v2', c: 'x'.repeat(700), i: 'abc' })
	).toString('base64');

	it('is never presented as the variable value', () => {
		const parsed = toEnvRecord({
			id: 'e1',
			key: 'NEXT_PUBLIC_BACKEND',
			type: 'encrypted',
			target: ['production'],
			value: envelope,
		});

		expect(parsed.readable).toBe(false);
		expect(parsed.value).toBeNull();
		// Still fetchable one record at a time, which is what separates a
		// Reveal action from a Replace one.
		expect(parsed.revealable).toBe(true);
	});

	it('does not make every variable look changed on save', () => {
		const masked = toEnvRecord({
			id: 'e1',
			key: 'API',
			type: 'encrypted',
			target: ['production'],
			value: envelope,
		});

		expect(diffEnv([masked], [{ id: 'e1', key: 'API', target: ['production'] }])).toHaveLength(0);
	});

	it('leaves a short real value alone', () => {
		const parsed = toEnvRecord({
			id: 'e2',
			key: 'MODE',
			type: 'plain',
			target: ['production'],
			value: 'server',
		});

		expect(parsed.readable).toBe(true);
		expect(parsed.value).toBe('server');
	});

	it('writes an unhydrated record as an empty key, not as a value', () => {
		const masked = toEnvRecord({
			id: 'e1',
			key: 'API',
			type: 'encrypted',
			target: ['production'],
			value: envelope,
		});

		const file = toEnvFile([masked], 'production');

		expect(file).toContain('API= #');
		expect(file).not.toContain(envelope.slice(0, 30));
	});
});

describe('forTarget', () => {
	it('picks only the records that apply to that target', () => {
		const both = record({ key: 'SHARED', target: ['production', 'preview'] });
		const previewOnly = record({ key: 'PREVIEW_ONLY', target: ['preview'] });

		expect(forTarget([both, previewOnly], 'production').map(r => r.key)).toEqual(['SHARED']);
		expect(forTarget([both, previewOnly], 'preview').map(r => r.key).sort()).toEqual([
			'PREVIEW_ONLY',
			'SHARED',
		]);
	});
});

describe('toEnvFile', () => {
	const parse = (text: string) => dotenv.parse(Buffer.from(text));

	it('round-trips a plain value', () => {
		const file = toEnvFile([record({ key: 'SIMPLE', value: 'hello' })], 'production');
		expect(parse(file).SIMPLE).toBe('hello');
	});

	it('round-trips a value containing double quotes', () => {
		const value = 'say "hi"';
		const file = toEnvFile([record({ key: 'QUOTED', value })], 'production');
		expect(parse(file).QUOTED).toBe(value);
	});

	it('round-trips a multi-line PEM block', () => {
		const value = '-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----';
		const file = toEnvFile([record({ key: 'PEM', value })], 'production');
		expect(parse(file).PEM).toBe(value);
	});

	it('round-trips a value containing a hash', () => {
		const value = 'pa#ssword';
		const file = toEnvFile([record({ key: 'HASHED', value })], 'production');
		expect(parse(file).HASHED).toBe(value);
	});

	it('writes a sensitive var as an empty key with an explanatory comment', () => {
		// Omitting it would make the file look like a complete set — someone
		// would deploy from it and lose a variable silently.
		const file = toEnvFile(
			[
				record({
					key: 'STRIPE_KEY',
					type: 'sensitive',
					value: null,
					readable: false,
					revealable: false,
				}),
			],
			'production'
		);

		expect(file).toContain('STRIPE_KEY=');
		expect(file).toContain('sensitive');
		expect(parse(file).STRIPE_KEY).toBe('');
	});

	it('contains only the requested target', () => {
		const file = toEnvFile(
			[
				record({ key: 'PROD_ONLY', target: ['production'], value: 'p' }),
				record({ key: 'DEV_ONLY', target: ['development'], value: 'd' }),
			],
			'production'
		);

		const parsed = parse(file);
		expect(parsed.PROD_ONLY).toBe('p');
		expect(parsed.DEV_ONLY).toBeUndefined();
	});
});

describe('toJsonFile', () => {
	it('keeps the target array and never claims a sensitive value', () => {
		const json = JSON.parse(
			toJsonFile([
				record({ key: 'SHARED', target: ['production', 'preview'], value: 'v' }),
				record({
					key: 'SECRET',
					type: 'sensitive',
					value: null,
					readable: false,
					revealable: false,
				}),
			])
		);

		expect(json[0].target).toEqual(['production', 'preview']);
		expect(json[1].value).toBeNull();
		expect(json[1].readable).toBe(false);
	});
});
