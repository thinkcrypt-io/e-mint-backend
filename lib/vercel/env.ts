import { vercelClient, withTeam } from './client.js';
import { escapeEnvValue } from '../dotenv/escape.js';

/**
 * Vercel environment variables.
 *
 * The single biggest structural difference from Heroku config vars, and the
 * reason none of `lib/heroku/configVars.ts` transfers:
 *
 * - Heroku holds one flat `{ KEY: value }` map, PATCHed whole, where null
 *   deletes. Vercel holds individually-identified records.
 * - **The same key exists up to three times**, once per target
 *   (production / preview / development), with three different values. A
 *   key -> value table cannot represent that; it is a key+target -> value table.
 * - `gitBranch` narrows a preview record to one branch: another axis again.
 * - A `sensitive` value can never be read back, by anyone, including the Vercel
 *   dashboard. It is replaceable, not readable.
 * - **`?decrypt=true` on the list does not decrypt** (confirmed against a live
 *   account, VWO-01 #8). An `encrypted` record comes back as a base64 envelope
 *   -- `{"v":"v2","c":"..."}` -- roughly a kilobyte long whatever the real value
 *   is. Only `GET /v1/projects/{id}/env/{envId}` returns plaintext, one record
 *   at a time. So a list read is always masked, and revealing or downloading
 *   costs one request per variable.
 * - There is no atomic multi-record write. A batch is N requests and request 4
 *   of 7 can fail — see `applyEnvChanges` in the controller layer.
 */

export type VercelEnvTarget = 'production' | 'preview' | 'development';

export const ENV_TARGETS: VercelEnvTarget[] = ['production', 'preview', 'development'];

export type VercelEnvType = 'plain' | 'encrypted' | 'sensitive' | 'secret';

export type VercelEnvRecord = {
	id: string;
	key: string;
	type: VercelEnvType;
	target: VercelEnvTarget[];
	gitBranch: string | null;
	comment: string | null;
	/** Null whenever the value was not returned — always so for `sensitive`. */
	value: string | null;
	/**
	 * Whether `value` above is real plaintext. False for a list read, which
	 * hands back an encrypted envelope, and false forever for `sensitive`.
	 */
	readable: boolean;
	/**
	 * Whether a plaintext value can be fetched one record at a time via
	 * `getEnvValue`. True for `plain` and `encrypted`, false for `sensitive` --
	 * which is the difference between a *Reveal* action and a *Replace* one.
	 */
	revealable: boolean;
	createdAt: string | null;
	updatedAt: string | null;
};

const iso = (value: any): string | null =>
	typeof value === 'number' || typeof value === 'string' ? new Date(value).toISOString() : null;

/**
 * Is this the base64 `{"v":"v2","c":"..."}` envelope rather than a real value?
 *
 * Without this check a list read renders a kilobyte of ciphertext in the value
 * column and calls it the variable's value -- and, worse, `diffEnv` would
 * compare a staged plaintext against an envelope and report every variable as
 * changed on every save.
 */
const isEnvelope = (value: string): boolean => {
	if (value.length < 40) return false;

	try {
		const decoded = Buffer.from(value, 'base64').toString('utf8');
		const parsed = JSON.parse(decoded);
		return !!parsed && typeof parsed === 'object' && 'c' in parsed && 'v' in parsed;
	} catch {
		return false;
	}
};

export const toEnvRecord = (data: any): VercelEnvRecord => {
	const type: VercelEnvType = data?.type || 'encrypted';
	const revealable = type !== 'sensitive';

	const raw = typeof data?.value === 'string' ? data.value : null;
	const readable = revealable && raw !== null && !isEnvelope(raw);

	return {
		id: data?.id,
		key: data?.key,
		type,
		target: Array.isArray(data?.target) ? data.target : data?.target ? [data.target] : [],
		gitBranch: data?.gitBranch || null,
		comment: data?.comment || null,
		value: readable ? raw : null,
		readable,
		revealable,
		createdAt: iso(data?.createdAt),
		updatedAt: iso(data?.updatedAt),
	};
};

/**
 * The identity of an env record for diffing purposes.
 *
 * Keyed on key + sorted targets + branch, **not on key alone**. Keying on the
 * key would silently merge the production and preview records for the same
 * name: the diff would report one change and the write would then touch two.
 */
export const envIdentity = (record: {
	key: string;
	target: string[] | string;
	gitBranch?: string | null;
}): string => {
	const targets = Array.isArray(record.target) ? record.target : [record.target];

	return [record.key, targets.slice().sort().join('+'), record.gitBranch || ''].join('|');
};

export type ListEnvOptions = {
	team?: string;
	decrypt?: boolean;
	gitBranch?: string;
};

/** GET /v9/projects/{idOrName}/env */
export const listEnv = async (
	token: string,
	project: string,
	{ team, decrypt = false, gitBranch }: ListEnvOptions = {}
): Promise<VercelEnvRecord[]> => {
	const { data } = await vercelClient(token).get(
		`/v9/projects/${encodeURIComponent(project)}/env`,
		{
			params: withTeam(
				{
					...(decrypt ? { decrypt: 'true' } : {}),
					...(gitBranch ? { gitBranch } : {}),
				},
				team
			),
		}
	);

	const records: VercelEnvRecord[] = (data?.envs || data || []).map(toEnvRecord);

	return records.sort(
		(a, b) => a.key.localeCompare(b.key) || envIdentity(a).localeCompare(envIdentity(b))
	);
};

/**
 * GET /v1/projects/{idOrName}/env/{id} — one decrypted value.
 *
 * The only endpoint that returns plaintext. Everything that needs real values
 * goes through here, one record at a time.
 */
export const getEnvValue = async (
	token: string,
	project: string,
	envId: string,
	team?: string
): Promise<VercelEnvRecord> => {
	const { data } = await vercelClient(token).get(
		`/v1/projects/${encodeURIComponent(project)}/env/${encodeURIComponent(envId)}`,
		{ params: withTeam({}, team) }
	);

	return toEnvRecord(data);
};

/**
 * Fetch the real values for a set of records.
 *
 * One request per variable, because that is the only shape the API offers, so
 * this is deliberately not called on a page load -- only on an explicit reveal
 * or a download. Concurrency is capped: `/v9/projects/{id}/env` reports a
 * budget of 300/hour on a live account, and firing fifty parallel requests at
 * it is how that budget disappears.
 *
 * A record that cannot be read is left exactly as it was rather than failing
 * the batch: a download with one unreadable variable is still a useful
 * download, and `readable` already says which.
 */
export const hydrateEnvValues = async (
	token: string,
	project: string,
	records: VercelEnvRecord[],
	team?: string,
	concurrency = 4
): Promise<VercelEnvRecord[]> => {
	const out = records.slice();
	const queue = records
		.map((record, index) => ({ record, index }))
		.filter(entry => entry.record.revealable && !entry.record.readable);

	let cursor = 0;

	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			const entry = queue[cursor];
			cursor += 1;

			try {
				const full = await getEnvValue(token, project, entry.record.id, team);
				if (full.readable) {
					out[entry.index] = { ...out[entry.index], value: full.value, readable: true };
				}
			} catch {
				// Leave the masked record in place.
			}
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker())
	);

	return out;
};

export type EnvInput = {
	key: string;
	value: string;
	type?: VercelEnvType;
	target: VercelEnvTarget[];
	gitBranch?: string | null;
	comment?: string;
};

/** POST /v10/projects/{idOrName}/env — accepts one record or an array. */
export const createEnv = async (
	token: string,
	project: string,
	records: EnvInput[],
	team?: string
): Promise<any> => {
	const { data } = await vercelClient(token).post(
		`/v10/projects/${encodeURIComponent(project)}/env`,
		records,
		{ params: withTeam({ upsert: 'true' }, team) }
	);

	return data;
};

/** PATCH /v9/projects/{idOrName}/env/{id} */
export const updateEnv = async (
	token: string,
	project: string,
	envId: string,
	patch: Partial<EnvInput>,
	team?: string
): Promise<any> => {
	const { data } = await vercelClient(token).patch(
		`/v9/projects/${encodeURIComponent(project)}/env/${encodeURIComponent(envId)}`,
		patch,
		{ params: withTeam({}, team) }
	);

	return data;
};

/** DELETE /v9/projects/{idOrName}/env/{id} */
export const deleteEnv = async (
	token: string,
	project: string,
	envId: string,
	team?: string
): Promise<void> => {
	await vercelClient(token).delete(
		`/v9/projects/${encodeURIComponent(project)}/env/${encodeURIComponent(envId)}`,
		{ params: withTeam({}, team) }
	);
};

export type EnvChangeKind = 'added' | 'updated' | 'removed';

export type EnvChange = {
	key: string;
	target: string;
	gitBranch: string;
	kind: EnvChangeKind;
};

export type StagedEnvRecord = {
	/** Present when editing an existing record, absent when adding one. */
	id?: string;
	key: string;
	value?: string;
	type?: VercelEnvType;
	target: VercelEnvTarget[];
	gitBranch?: string | null;
};

/**
 * Key-level diff between what Vercel holds and the full desired set.
 *
 * `staged` is the complete intended state for the project, so anything in
 * `existing` with no match is a removal. Returns key names, targets and a
 * change kind only — never a value, on either side. That boundary is what makes
 * this an audit log rather than a second copy of the secrets.
 *
 * One change row per target, not per record: a record spanning production and
 * preview produces two rows, because "changed DATABASE_URL" is not a useful
 * line when it could mean either.
 */
export const diffEnv = (
	existing: VercelEnvRecord[],
	staged: StagedEnvRecord[]
): EnvChange[] => {
	const changes: EnvChange[] = [];

	const existingById: Record<string, VercelEnvRecord> = {};
	const existingByIdentity: Record<string, VercelEnvRecord> = {};

	existing.forEach(record => {
		existingById[record.id] = record;
		existingByIdentity[envIdentity(record)] = record;
	});

	const expand = (record: { key: string; target: string[]; gitBranch?: string | null }, kind: EnvChangeKind) =>
		record.target.forEach(target =>
			changes.push({
				key: record.key,
				target,
				gitBranch: record.gitBranch || '',
				kind,
			})
		);

	const seen: Record<string, boolean> = {};

	staged.forEach(record => {
		const identity = envIdentity(record);
		const prior = (record.id && existingById[record.id]) || existingByIdentity[identity];

		if (prior) {
			seen[prior.id] = true;

			// `prior.readable` is false both for a `sensitive` variable and for
			// any record that came from a list read, which returns an envelope
			// rather than a value. In both cases there is nothing to compare
			// against, so a change is only claimed when the caller actually
			// supplied a replacement — otherwise every save would report every
			// variable as updated.
			const valueChanged = prior.readable
				? typeof record.value === 'string' && record.value !== prior.value
				: typeof record.value === 'string' && record.value.length > 0;

			const shapeChanged =
				envIdentity(prior) !== identity || (record.type && record.type !== prior.type);

			if (valueChanged || shapeChanged) expand({ ...record, target: record.target }, 'updated');
			return;
		}

		expand({ ...record, target: record.target }, 'added');
	});

	existing.forEach(record => {
		if (seen[record.id]) return;
		expand({ key: record.key, target: record.target, gitBranch: record.gitBranch }, 'removed');
	});

	return changes.sort(
		(a, b) => a.key.localeCompare(b.key) || a.target.localeCompare(b.target)
	);
};

/** Records that apply to one target, sorted for a stable, diffable download. */
export const forTarget = (
	records: VercelEnvRecord[],
	target: VercelEnvTarget
): VercelEnvRecord[] =>
	records
		.filter(record => record.target.indexOf(target) !== -1)
		.sort((a, b) => a.key.localeCompare(b.key));

/**
 * A `.env` file for one target.
 *
 * The target is part of the request, not a hidden setting: a flat `.env` cannot
 * represent three values for one key, so asking for "the env file" without
 * saying which target is a question with no answer.
 *
 * A `sensitive` record is written as `KEY=` with a comment rather than omitted.
 * Leaving it out would make the file look like a complete set when it is not —
 * someone would deploy from it and lose a variable silently.
 */
export const toEnvFile = (records: VercelEnvRecord[], target: VercelEnvTarget): string => {
	const lines = forTarget(records, target).map(record => {
		if (record.readable && record.value !== null) {
			return `${record.key}=${escapeEnvValue(record.value)}`;
		}

		if (!record.revealable) {
			return `${record.key}= # sensitive - value not retrievable from the Vercel API`;
		}

		// Revealable but not hydrated: the caller downloaded without running
		// `hydrateEnvValues`, or that record's fetch failed.
		return `${record.key}= # value could not be read`;
	});

	const header = [
		`# Vercel environment - ${target}`,
		`# ${lines.length} variable(s). Values are live secrets; do not commit this file.`,
		'',
	];

	return header.concat(lines).join('\n') + '\n';
};

/**
 * Every record, every target, as JSON.
 *
 * Lossless where the `.env` form is not — it keeps the target array, the branch
 * and the type, and it can hold a value that no dotenv quoting expresses
 * cleanly. This is what the UI should point at when a value is unusual.
 */
export const toJsonFile = (records: VercelEnvRecord[]): string =>
	JSON.stringify(
		records.map(record => ({
			key: record.key,
			value: record.readable ? record.value : null,
			readable: record.readable,
			type: record.type,
			target: record.target,
			gitBranch: record.gitBranch,
			comment: record.comment,
		})),
		null,
		2
	) + '\n';
