import dotenv from 'dotenv';

dotenv.config();

/**
 * VWO-01 — the live-token spike from VERCEL_INTEGRATION_WORK_ORDER.md.
 *
 * Throwaway. Delete it once its twelve answers are written back into that
 * document. Nothing in lib/vercel may import from here.
 *
 * Five of the endpoints the Vercel console wants are not in the installed
 * @vercel/sdk, and several more may simply not answer on a Hobby plan. A 403,
 * a 404 and an empty array mean three different things to the UI, and guessing
 * which one each returns is how a tab ships that says "error" when the honest
 * answer is "not on your plan". So: ask the real account, write down what it
 * said, then build.
 *
 * Run with:
 *   VERCEL_SPIKE_TOKEN=xxx node scripts/spikeVercel.js
 * or:
 *   node scripts/spikeVercel.js <token>
 *
 * It falls back to VERCEL_TOKEN from .env, which is the storefront deploy
 * token — fine to read with, and this script only reads.
 *
 * SAFETY: every call here is a GET. Nothing is created, changed or deleted, so
 * it is safe to point at the account that serves live shops. Env var *values*
 * are redacted before printing — the question is what shape comes back, never
 * what the secret is.
 */

const API = 'https://api.vercel.com';

const token =
	process.argv[2] || process.env.VERCEL_SPIKE_TOKEN || process.env.VERCEL_TOKEN;

if (!token) {
	console.error(
		'No token. Pass one as an argument, or set VERCEL_SPIKE_TOKEN or VERCEL_TOKEN.'
	);
	process.exit(1);
}

const RATE_HEADERS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];

/** Every probe goes through this so one endpoint 403ing cannot end the run. */
const probe = async (label, path) => {
	const url = `${API}${path}`;

	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${token}` },
		});

		const rate = {};
		RATE_HEADERS.forEach(h => {
			const v = res.headers.get(h);
			if (v !== null) rate[h] = v;
		});

		let body = null;
		const text = await res.text();

		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			// Not JSON. Keep the first bit so a streaming or plain-text response
			// is identifiable rather than looking like an empty answer.
			body = { __nonJson: text.slice(0, 400) };
		}

		return { label, path, status: res.status, ok: res.ok, rate, body };
	} catch (e) {
		return { label, path, status: 0, ok: false, rate: {}, error: e.message };
	}
};

/** Values are secrets; lengths and types are the answer we actually want. */
const redactEnvRecord = r => ({
	key: r?.key,
	type: r?.type,
	target: r?.target,
	gitBranch: r?.gitBranch ?? null,
	hasValueField: Object.prototype.hasOwnProperty.call(r || {}, 'value'),
	valueIsNull: r?.value === null,
	valueIsEmptyString: r?.value === '',
	valueLength: typeof r?.value === 'string' ? r.value.length : null,
});

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(72));

const report = (n, question, result, extra) => {
	rule();
	line(`Q${n}. ${question}`);
	line(`    ${result.status} ${result.path}`);
	if (result.error) line(`    request failed: ${result.error}`);
	if (Object.keys(result.rate).length) line(`    rate: ${JSON.stringify(result.rate)}`);
	if (extra) extra();
};

const errorOf = body => body?.error?.code || body?.error?.message || null;

const run = async () => {
	line();
	line('VWO-01 — Vercel live-token spike');
	line(`token ...${String(token).slice(-4)}`);
	line('All calls are GETs with no teamId, which is the shape production uses.');
	line();

	//Q1 — identity and teams
	const user = await probe('user', '/v2/user');
	const teams = await probe('teams', '/v2/teams');

	report(1, 'Does this token have teams, and what plan is the account on?', user, () => {
		const u = user.body?.user || user.body;
		line(`    user: ${u?.username || u?.email || '(unreadable)'}`);
		// The installed SDK's AuthUser model carries no plan field, so this is
		// the point of the question: find out what a real response actually has.
		const planish = Object.keys(u || {}).filter(k =>
			/plan|billing|version|tier|resourceConfig/i.test(k)
		);
		line(`    plan-shaped top-level keys: ${planish.length ? planish.join(', ') : 'NONE'}`);
		planish.forEach(k => {
			const v = u[k];
			line(`      ${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : v}`);
		});
		line(`    teams: ${teams.status} -> ${(teams.body?.teams || []).length} team(s)`);
		(teams.body?.teams || []).forEach(t => line(`      ${t.id}  ${t.slug}  ${t.name}`));
	});

	//Q2 — projects with no teamId
	const projects = await probe('projects', '/v9/projects?limit=100');
	const projectList = projects.body?.projects || [];

	report(2, 'Does GET /v9/projects with no teamId return the personal projects?', projects, () => {
		line(`    ${projectList.length} project(s)`);
		projectList
			.slice(0, 40)
			.forEach(p => line(`      ${p.id}  ${p.name}  (${p.framework || 'no framework'})`));
		if (projectList.length > 40) line(`      ... and ${projectList.length - 40} more`);
		line(`    pagination: ${JSON.stringify(projects.body?.pagination || null)}`);
	});

	//Q3 — storage stores
	const stores = await probe('stores', '/v1/storage/stores');
	report(3, 'Does GET /v1/storage/stores exist on this plan?', stores, () => {
		if (stores.ok) {
			const s = stores.body?.stores || stores.body;
			line(`    ${JSON.stringify(s).slice(0, 600)}`);
		} else {
			line(`    error: ${errorOf(stores.body)}`);
			line('    -> 403 means Pro-only: the Resources "Stores" panel becomes a plan notice.');
		}
	});

	//Q4 — runtime logs (decides Phase 7)
	const sample = projectList[0];
	let firstDeployment = null;

	if (sample) {
		const deployments = await probe(
			'deployments',
			`/v6/deployments?projectId=${encodeURIComponent(sample.id)}&limit=20`
		);
		firstDeployment = (deployments.body?.deployments || [])[0] || null;

		//Q12 — the fields VWO-22's build-minute arithmetic rests on
		report(12, 'Do real deployments carry createdAt / buildingAt / ready?', deployments, () => {
			const list = deployments.body?.deployments || [];
			line(`    ${list.length} deployment(s) for ${sample.name}`);
			list.slice(0, 5).forEach(d => {
				const dur =
					d.ready && d.buildingAt ? `${Math.round((d.ready - d.buildingAt) / 1000)}s` : 'n/a';
				line(
					`      ${d.uid || d.id}  state=${d.readyState || d.state}  target=${d.target}` +
						`  createdAt=${d.createdAt ?? 'MISSING'}  buildingAt=${d.buildingAt ?? 'MISSING'}` +
						`  ready=${d.ready ?? 'MISSING'}  build=${dur}`
				);
			});
			line(`    pagination: ${JSON.stringify(deployments.body?.pagination || null)}`);
		});
	}

	if (firstDeployment) {
		const depId = firstDeployment.uid || firstDeployment.id;
		const runtime = await probe('runtime-logs', `/v1/deployments/${depId}/runtime-logs`);

		report(4, 'Do runtime logs exist on this plan? (decides Phase 7)', runtime, () => {
			if (runtime.ok) {
				line('    AVAILABLE — Phase 7 is buildable.');
				line(`    body starts: ${JSON.stringify(runtime.body).slice(0, 300)}`);
			} else {
				line(`    error: ${errorOf(runtime.body)}`);
				line('    -> not available: DROP Phase 7, and say so on the docs page.');
			}
		});

		//Q7 — build logs, primary need #7
		const events = await probe('build-logs', `/v3/deployments/${depId}/events?limit=5`);
		report(7, 'Do build logs come back? (primary need #7)', events, () => {
			const n = Array.isArray(events.body) ? events.body.length : 0;
			line(`    ${n} event(s); shape: ${JSON.stringify(events.body).slice(0, 300)}`);
		});
	} else {
		rule();
		line('Q4/Q7/Q12 skipped — no deployment found to probe.');
	}

	//Q5 — log drains
	const drains = await probe('log-drains', '/v1/log-drains');
	const webhooks = await probe('webhooks', '/v1/webhooks');
	report(5, 'Are log drains available? (believed Pro and above)', drains, () => {
		line(`    /v1/log-drains: ${drains.status} ${errorOf(drains.body) || 'ok'}`);
		line(`    /v1/webhooks:   ${webhooks.status} ${errorOf(webhooks.body) || 'ok'}`);
	});

	//Q8 — env var shape, and what a `sensitive` value looks like
	if (sample) {
		const env = await probe(
			'env',
			`/v9/projects/${encodeURIComponent(sample.id)}/env?decrypt=true`
		);

		report(8, 'What does env?decrypt=true return, and what for a sensitive var?', env, () => {
			if (!env.ok) {
				line(`    error: ${errorOf(env.body)}`);
				line('    -> decrypt may not be permitted here; the Environment tab reads masked only.');
				return;
			}
			const records = env.body?.envs || env.body || [];
			line(`    ${records.length} record(s) (values redacted — shape only)`);
			records.slice(0, 25).forEach(r => line(`      ${JSON.stringify(redactEnvRecord(r))}`));
			const sensitive = records.filter(r => r?.type === 'sensitive');
			line(`    sensitive records: ${sensitive.length}`);
			sensitive
				.slice(0, 5)
				.forEach(r => line(`      SENSITIVE -> ${JSON.stringify(redactEnvRecord(r))}`));
			const multi = {};
			records.forEach(r => {
				multi[r.key] = (multi[r.key] || 0) + 1;
			});
			const dupes = Object.keys(multi).filter(k => multi[k] > 1);
			line(`    keys existing more than once (per-target duplication): ${dupes.length}`);
			dupes.slice(0, 10).forEach(k => line(`      ${k} x${multi[k]}`));
		});
	}

	//Q11 — metered usage, the decisive one for primary need #3
	const usageProbes = [
		await probe('usage', '/v1/usage'),
		await probe('observability', '/v1/observability/usage'),
		await probe('account-usage', '/v1/account/usage'),
	];

	rule();
	line('Q11. Is metered usage reachable at all? (primary need #3)');
	usageProbes.forEach(u => {
		line(`    ${u.status} ${u.path}  ${errorOf(u.body) || (u.ok ? 'OK' : '')}`);
		if (u.ok) line(`      body: ${JSON.stringify(u.body).slice(0, 400)}`);
	});
	line('    Any OK above -> VWO-22 gains real metered figures and delta #4 needs a correction.');
	line('    All failing   -> VWO-22 ships derived-only, which is already specced.');

	//Q6 — rate limit headers, gathered from everything above
	rule();
	line('Q6. Which rate-limit headers actually come back?');
	const seen = [user, projects, stores, drains, ...usageProbes].filter(
		r => Object.keys(r.rate).length
	);
	if (!seen.length) {
		line('    NONE on any endpoint probed. VWO-05 cache TTLs stay conservative,');
		line('    and VWO-03 readRateLimit returns null rather than inventing a budget.');
	} else {
		seen.forEach(r => line(`    ${r.path} -> ${JSON.stringify(r.rate)}`));
	}

	rule();
	line();
	line('Still to answer by hand (they need a write, so this script will not do them):');
	line('  Q9  — does POST /v13/deployments with { deploymentId } redeploy,');
	line('        or does it need a full file manifest?');
	line('  Q10 — does POST /v10/projects/{id}/promote/{deploymentId} move production?');
	line('        USE A THROWAWAY PROJECT, NEVER A STOREFRONT.');
	line('  Q7b — the daily deployment cap and the response shape when it is hit.');
	line();
	line('Write every answer into backend/VERCEL_INTEGRATION_WORK_ORDER.md, then');
	line('delete this file.');
	line();
};

run().catch(e => {
	console.error('Spike failed:', e);
	process.exit(1);
});
