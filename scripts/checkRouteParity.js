import dotenv from 'dotenv';
import mongoose from 'mongoose';
import express from 'express';

dotenv.config();

/**
 * Proves the admin gets the same API whether a route runs on its DB copy or
 * on its code files.
 *
 * The admin router is mounted twice in one process: at /admin/api, where
 * routes resolve their published RouteSettings / RouteConfig, and at /code,
 * outside the admin API, where they always use the code files. For every
 * route the two are compared:
 *
 *   - what constructConfig builds: validators (Joi descriptions), editable,
 *     sortable, searchable and unique fields, populate, exclude, export
 *   - GET /get/schema, /get/config, /get/route — byte for byte
 *   - the filter row (getFilters)
 *
 * A difference is EXPECTED when the published copy itself differs from the
 * code (someone customized the route in the builder). It is a PROBLEM when
 * the copies are identical but the API output isn't — that would mean the DB
 * path changes the shape of what the admin receives. Exit code 1 on any
 * problem, so it can gate a deploy.
 *
 * Run with:  npm run build && node scripts/checkRouteParity.js [--verbose]
 */

const VERBOSE = process.argv.includes('--verbose');

const { default: adminRouter } = await import('../dist/routes-admin/admin.router.js');
const { collectResourceRoutes, collectFilterRoutes, settingsToData, configToData, ADMIN_API_PREFIX } =
	await import('../dist/library/functions/routeRegistry.function.js');
const { resolveRoute, getActiveSettings, getActiveConfig } = await import(
	'../dist/library/functions/resolveRoute.function.js'
);
const { default: constructConfig } = await import('../dist/lib/configurator/constructConfig.js');

const J = x => JSON.stringify(x, (k, v) => (typeof v === 'function' ? v.modelName || 'fn' : v));
const pickBuilt = c => ({
	filterOptions: c.FILTER_OPTIONS,
	exists: c.EXIST_OPTIONS.fields,
	duplicate: c.DUPLICATE_OPTIONS.unique,
	populate: c.QUERY_OPTIONS.populate,
	exclude: c.QUERY_OPTIONS.exclude,
	edits: c.EDITS.allowEdits,
	export: c.EXPORT_OPTIONS.populate,
	postValidator: c.VALIDATORS.POST.describe(),
	updateValidator: c.VALIDATORS.UPDATE.describe(),
});

await mongoose.connect(process.env.MONGO_CONNECTION_URI);

const app = express();
app.use(ADMIN_API_PREFIX, adminRouter);
app.use('/code', adminRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const get = async path => {
	const res = await fetch(base + path);
	return { status: res.status, body: await res.text(), source: res.headers.get('x-route-source') };
};
const call = (handler, req) =>
	new Promise(resolve => handler(req, { status: c => ({ json: b => resolve({ c, b }) }) }));

const problems = [];
const expected = [];
let checked = 0;

const resources = collectResourceRoutes(app);
const filterRoutes = collectFilterRoutes(app);
const filterByRoute = new Map(filterRoutes.map(e => [e.route, e]));

for (const entry of resources) {
	const { route, source } = entry;
	const codeBuilt = constructConfig({ model: source.Model, config: source.settings, options: { role: 'admin' } });
	const resolved = await resolveRoute(route, { ...source, built: codeBuilt });

	const [activeSettings, activeConfig] = await Promise.all([getActiveSettings(route), getActiveConfig(route)]);
	const settingsCustomized = activeSettings && J(activeSettings.data) !== J(settingsToData(source.settings));

	const f = filterByRoute.get(route);
	const role = f?.source.role;
	const codeFilters = (f?.source.filters || []).filter(x => !x?.roles?.length || !role || x.roles.includes(role));
	const codeConfigData = configToData(source.frontendConfig, codeFilters);
	const configCustomized = activeConfig && J(activeConfig.data) !== J(codeConfigData);

	const report = (what, customized) => {
		const line = `${route}: ${what}`;
		(customized ? expected : problems).push(line);
	};

	// 1. What the API validates and queries with.
	const a = pickBuilt(resolved.built);
	const b = pickBuilt(codeBuilt);
	for (const k of Object.keys(a)) if (J(a[k]) !== J(b[k])) report(`built.${k} differs`, settingsCustomized);

	// 2. The endpoints the admin pages read.
	for (const ep of ['get/schema', 'get/config', 'get/route']) {
		const [db, code] = await Promise.all([get(`${ADMIN_API_PREFIX}/${route}/${ep}`), get(`/code/${route}/${ep}`)]);
		checked++;
		if (db.status !== code.status || db.body !== code.body)
			report(`${ep} ${db.status}/${code.status} (${db.source})`, ep === 'get/schema' ? settingsCustomized : configCustomized);
	}
}

// 3. Filter rows — every route with one, custom routes included.
for (const e of filterRoutes) {
	let handler;
	const walk = stack => {
		for (const l of stack || []) {
			if (l.route) for (const x of l.route.stack) if (x.handle.filterSource === e.source) handler = x.handle;
			if (l.handle?.stack) walk(l.handle.stack);
		}
	};
	walk(app._router.stack);
	const [head, ...rest] = e.route.split('/');
	const routePath = (rest.length ? '/' + rest.join('/') : '') + '/get/filters';
	const [db, code] = await Promise.all([
		call(handler, { baseUrl: `${ADMIN_API_PREFIX}/${head}`, route: { path: routePath }, queryHelper: {} }),
		call(handler, { baseUrl: `/code/${head}`, route: { path: routePath }, queryHelper: {} }),
	]);
	const norm = r => J(r.b.map(f => Object.keys(f).sort().reduce((o, k) => ((o[k] = k === 'options' ? f[k]?.length : f[k]), o), {})));
	checked++;
	if (norm(db) !== norm(code)) {
		const role = e.source.role;
		const codeFilters = (e.source.filters || []).filter(x => !x?.roles?.length || !role || x.roles.includes(role));
		const active = await getActiveConfig(e.route);
		const customized = active && J(active.data.filters) !== J(configToData(null, codeFilters).filters);
		(customized ? expected : problems).push(`${e.route}: get/filters differs`);
	}
}

console.log(`${resources.length} settings-driven routes, ${filterRoutes.length} filter rows, ${checked} responses compared`);
console.log(`  ${expected.length} expected differences (published copy customized in the builder)`);
if (VERBOSE) expected.forEach(x => console.log(`    · ${x}`));
if (problems.length) {
	console.log(`  ${problems.length} PROBLEMS — identical copies, different API output:`);
	problems.forEach(x => console.log(`    ✗ ${x}`));
} else console.log('  0 problems — the admin gets the same API from the DB copies as from the code files');

server.close();
await mongoose.disconnect();
process.exit(problems.length ? 1 : 0);
