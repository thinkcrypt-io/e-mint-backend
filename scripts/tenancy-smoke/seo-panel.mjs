// SEO panel SP-01/02/05 (docs/seo-panel): an SEO project is a website with `edition: 'seo'`; its panel logins sign in
// at the SEO app (`app: 'seo'`) only, hold fixed SEO keys, reach only the SEO panel's paths, and until the site is
// live only setup (409 NOT_CONNECTED). Needs SMOKE_MONGO (sets the connection live directly; SP-07 does it for real).
import { call, ok, done, claims } from './lib.mjs';
const SMOKE_MONGO = process.env.SMOKE_MONGO;
if (!SMOKE_MONGO || !/127\.0\.0\.1|localhost/.test(SMOKE_MONGO)) throw new Error('SMOKE_MONGO must be a local scratch database');
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sia Seo', email: `sia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Seo ${stamp}`, country: 'BD' });
const t = r.body?.token;

// ---- SP-01: the edition
r = await call('POST', '/tenant/api/projects', { name: 'An app', type: 'app', edition: 'seo' }, t);
ok('edition on an app project is refused', r.status === 400, r.body?.message);
r = await call('POST', '/tenant/api/projects', { name: 'A site', type: 'website', edition: 'shop' }, t);
ok('an unknown edition is refused', r.status === 400, r.body?.message);
r = await call('POST', '/tenant/api/projects', { name: 'Acme SEO', type: 'website', edition: 'seo' }, t);
const seo = r.body;
ok('an SEO project is made, edition in the answer', r.status === 200 && seo?.edition === 'seo', JSON.stringify(r.body).slice(0, 200));
r = await call('POST', '/tenant/api/projects', { name: 'Plain site', type: 'website' }, t);
const site = r.body;
ok('a plain website has no edition', r.status === 200 && !site?.edition);
const P = `/tenant/api/p/${seo._id}`;

r = await call('GET', `${P}/site-config`, null, t);
ok('site-config carries connection (status setup, step 1)', r.status === 200 && r.body?.connection?.status === 'setup' && r.body.connection.step === 1, JSON.stringify(r.body?.connection));

// ---- logins: no role needed in an SEO project
r = await call('POST', `${P}/panel-users`, { name: 'Sam Seo', username: `seo${stamp}`, password: 'seo-pass-1234' }, t);
ok('an SEO login needs no role', r.status === 201, JSON.stringify(r.body));
r = await call('POST', `${P}/panel-users`, { name: 'Boss', username: `boss${stamp}`, password: 'seo-pass-1234', superAdmin: true }, t);
ok('an SEO super admin is made', r.status === 201, JSON.stringify(r.body));
r = await call('POST', `/tenant/api/p/${site._id}/panel-users`, { name: 'Pat', username: `pat${stamp}`, password: 'seo-pass-1234' }, t);
ok('a plain website login still needs a role', r.status === 400);
r = await call('POST', `/tenant/api/p/${site._id}/panel-users`, { name: 'Pat', username: `pat${stamp}`, password: 'seo-pass-1234', superAdmin: true }, t);
ok('a plain website super admin', r.status === 201);

// ---- which app
r = await call('POST', '/tenant/api/panel/auth/login', { username: `seo${stamp}`, password: 'seo-pass-1234', app: 'panel' });
ok('SEO login at the panel app: 400 use_seo', r.status === 400 && r.body?.code === 'use_seo', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/login', { username: `seo${stamp}`, password: 'seo-pass-1234' });
ok('…and at the commerce panel (default app): use_seo', r.status === 400 && r.body?.code === 'use_seo', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/login', { username: `pat${stamp}`, password: 'seo-pass-1234', app: 'seo' });
ok('a plain website login at the SEO app: use_panel', r.status === 400 && r.body?.code === 'use_panel', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/login', { username: `seo${stamp}`, password: 'seo-pass-1234', app: 'seo' });
const st = r.body?.token;
ok('SEO login at the SEO app → token', r.status === 200 && !!st && r.body?.project?.edition === 'seo', JSON.stringify(r.body).slice(0, 300));
ok('token: kind panel, its project', claims(st).kind === 'panel' && claims(st).project === seo._id);
r = await call('POST', '/tenant/api/panel/auth/login', { username: `boss${stamp}`, password: 'seo-pass-1234', app: 'seo' });
const bt = r.body?.token;
ok('super admin signs in', r.status === 200 && !!bt);

r = await call('GET', '/tenant/api/panel/auth/self', null, st);
const keys = r.body?.permissions || [];
ok('self: SEO admin, the fixed SEO keys', r.body?.role?.name === 'SEO admin' && ['view-seo', 'edit-pages', 'publish-seo', 'view-analytics', 'manage-site', 'view-image'].every(k => keys.includes(k)), JSON.stringify(keys));
ok('self: no build, records:*, panel users', !keys.some(k => k === 'build' || k.startsWith('records:') || k === 'manage-panel-users'));
r = await call('GET', '/tenant/api/panel/auth/self', null, bt);
ok('super admin: manages panel users too', r.body?.role?.name === 'Super admin' && r.body.permissions.includes('manage-panel-users'));

// ---- before live: setup only
r = await call('GET', P, null, st);
ok('the project opens', r.status === 200 && r.body?.edition === 'seo');
r = await call('GET', `${P}/project-key`, null, st);
ok('the project key (for the snippet)', r.status === 200 && /^mint_pk_/.test(r.body?.apiKey || ''));
r = await call('GET', `${P}/site-config`, null, st);
ok('site-config reads', r.status === 200 && r.body?.connection?.status === 'setup');
r = await call('GET', `${P}/sidebar/admin/server`, null, st);
let side = JSON.stringify(r.body || []);
ok('sidebar before live: Set up your site + Help only', side.includes('"/setup"') && side.includes('"/help"') && !side.includes('"/t/seo"') && !side.includes('"/analytics"'), side);
r = await call('GET', `${P}/sidebar/admin/server`, null, bt);
ok('…a super admin also sees Panel users', JSON.stringify(r.body || []).includes('"/panel-users"'));
for (const [m, path] of [['GET', '/seo'], ['GET', '/pages'], ['GET', '/analytics/summary'], ['PUT', '/site-config'], ['GET', '/media']]) {
	r = await call(m, `${P}${path}`, m === 'PUT' ? { seo: { siteName: 'Acme' } } : null, st);
	ok(`before live: ${m} ${path} → 409 NOT_CONNECTED`, r.status === 409 && r.body?.code === 'NOT_CONNECTED', `${r.status} ${r.body?.code}`);
}
for (const [m, path] of [['GET', '/builder/models'], ['GET', '/automations'], ['GET', '/site-builder'], ['GET', '/api-builder/endpoints'], ['GET', '/panel-roles'], ['GET', '/people'], ['GET', '/content'], ['GET', '/web-contents'], ['GET', '/widgets'], ['GET', '/dashboard']]) {
	r = await call(m, `${P}${path}`, null, st);
	ok(`never: ${m} ${path} → 403 SEO_PANEL_ONLY`, r.status === 403 && r.body?.code === 'SEO_PANEL_ONLY', `${r.status} ${r.body?.code}`);
}
// ---- SP-05: setup step 1, the address + what we find there (two local "sites")
const { createServer } = await import('node:http');
const projectKey = (await call('GET', `${P}/project-key`, null, st)).body?.apiKey;
const serve = (html, headers = {}) =>
	new Promise(res => {
		const srv = createServer((req, rsp) => {
			if (req.url === '/sitemap.xml') {
				rsp.writeHead(200, { 'content-type': 'application/xml' });
				return rsp.end('<urlset><url><loc>a</loc></url><url><loc>b</loc></url><url><loc>c</loc></url></urlset>');
			}
			rsp.writeHead(200, { 'content-type': 'text/html', ...headers });
			rsp.end(html);
		}).listen(0, '127.0.0.1', () => res(srv));
	});
const wp = await serve(
	'<html><head><title>Acme &amp; Co</title><meta name="generator" content="WordPress 6.6"><meta name="description" content="Bolts and nuts"><meta property="og:image" content="https://acme.example/og.png"></head><body><link rel="stylesheet" href="/wp-content/themes/x.css"><p>Hello</p></body></html>',
	{ 'cf-ray': '8abc-DAC', server: 'cloudflare' }
);
const shop = await serve(`<html><head><title>Shop</title><script src="https://api.example/public/track.js" data-key="${projectKey}" data-seo></script></head><body><script src="https://cdn.shopify.com/s/x.js"></script></body></html>`);
const wpHost = `localhost:${wp.address().port}`;
r = await call('POST', `${P}/seo-setup/detect`, { url: `http://${wpHost}` }, st);
const d = r.body?.detected;
ok('detect: a WordPress site behind Cloudflare', r.status === 200 && d?.platform === 'wordpress' && d.proxied === true, JSON.stringify(r.body).slice(0, 400));
ok('…its title, description and share image', d?.seo?.title === 'Acme & Co' && d.seo.description === 'Bolts and nuts' && d.seo.image === 'https://acme.example/og.png', JSON.stringify(d?.seo));
ok('…3 pages in its sitemap, no snippet, no Worker', d?.sitemapPages === 3 && d.snippet === 'none' && !d.worker, JSON.stringify(d));
ok('…recommends the Worker (already on Cloudflare)', d?.recommend === 'cloudflare' && !!d.why);
ok('…saved: address, hostnames, step 2, still setup', r.body?.connection?.siteUrl === `http://${wpHost}` && r.body.connection.hostnames[0] === wpHost && r.body.connection.step === 2 && r.body.connection.status === 'setup', JSON.stringify(r.body?.connection));
ok('…the host is in the project’s domains', (r.body?.domains || []).includes(wpHost));
r = await call('GET', `${P}/site-config`, null, st);
ok('site-config carries what was found', r.body?.connection?.detected?.platform === 'wordpress' && r.body.connection.step === 2, JSON.stringify(r.body?.connection).slice(0, 300));
r = await call('POST', `${P}/seo-setup/way`, { mode: 'cloudflare' }, st);
ok('way: picking Cloudflare saves mode, step 3, keeps the address and status', r.status === 200 && r.body?.connection?.mode === 'cloudflare' && r.body.connection.step === 3 && r.body.connection.status === 'setup' && r.body.connection.siteUrl === `http://${wpHost}`, JSON.stringify(r.body));
r = await call('POST', `${P}/seo-setup/way`, { mode: 'carrier-pigeon' }, st);
ok('way: anything else → 400', r.status === 400);
r = await call('GET', `${P}/site-config`, null, st);
ok('…site-config carries the way and still the detection', r.body?.connection?.mode === 'cloudflare' && r.body.connection.detected?.platform === 'wordpress', JSON.stringify(r.body?.connection).slice(0, 200));
r = await call('POST', `${P}/seo-setup/detect`, { url: `localhost:${shop.address().port}` }, st);
ok('detect: a Shopify site with our snippet, typed without http:// → the snippet way', r.status === 200 && r.body?.detected?.platform === 'shopify' && r.body.detected.snippet === 'ours' && r.body.detected.snippetSeo && r.body.detected.recommend === 'script', JSON.stringify(r.body).slice(0, 400));
r = await call('GET', P, null, st);
ok('…both hosts are now domains, none twice', r.body?.domains?.filter(x => x === wpHost).length === 1 && r.body.domains.includes(`localhost:${shop.address().port}`), JSON.stringify(r.body?.domains));
wp.close();
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const client = await new MongoClient(SMOKE_MONGO).connect();
r = await call('POST', `${P}/seo-setup/verify`, {}, st);
ok('verify: nothing proves ownership yet', r.status === 200 && r.body?.owned === false && r.body.how === null && r.body.txt === `mint-verify=${seo._id}`, JSON.stringify(r.body));
r = await call('POST', `${P}/seo-setup/start`, {}, st);
ok('start before ownership → 409 with why', r.status === 409 && /yours|own/i.test(r.body?.message || '') , JSON.stringify(r.body));
r = await call('GET', `${P}/site-config`, null, st);
ok('…still setup', r.body?.connection?.status === 'setup' && r.body.connection.txt === `mint-verify=${seo._id}`, JSON.stringify(r.body?.connection).slice(0, 200));
const shopHost = `localhost:${shop.address().port}`;
const sdoc = await client.db().collection('websitesettings').findOne({ project: new ObjectId(seo._id) });
await client.db().collection('websiteevents').insertOne({ project: new ObjectId(seo._id), organization: sdoc.organization, type: 'pageview', host: shopHost, path: '/', createdAt: new Date() });
r = await call('POST', `${P}/seo-setup/verify`, {}, st);
ok('verify: a visit from the site’s host proves it', r.body?.owned === true && r.body.how === 'visit' && r.body.checks.visit === true, JSON.stringify(r.body));
r = await call('POST', `${P}/seo-setup/start`, {}, st);
ok('start: owned + test passes → live, step 5, times set', r.status === 200 && r.body?.connection?.status === 'live' && r.body.connection.step === 5 && !!r.body.connection.liveAt && !!r.body.connection.verifiedAt, JSON.stringify(r.body).slice(0, 300));
shop.close();
await client.close();
r = await call('POST', `${P}/seo-setup/detect`, { url: `http://${wpHost}` }, st);
ok('detect: a site that doesn’t answer → 400 with why', r.status === 400 && /reach/i.test(r.body?.message || ''), JSON.stringify(r.body));
r = await call('POST', `${P}/seo-setup/detect`, { url: '' }, st);
ok('detect: no address → 400', r.status === 400);
r = await call('POST', `/tenant/api/p/${site._id}/seo-setup/detect`, { url: 'http://localhost:1' }, t);
ok('the owner of a plain website may detect too (not SEO-gated)', r.status === 400 && /reach/i.test(r.body?.message || ''), JSON.stringify(r.body));

r = await call('GET', `${P}/panel-users`, null, bt);
ok('super admin lists panel users before live', r.status === 200, `${r.status}`);
r = await call('GET', `${P}/panel-users`, null, st);
ok('a plain SEO login can’t', r.status === 403);

// The owner (tenant token) isn't held by the guard.
r = await call('GET', `${P}/builder/models`, null, t);
ok('the project owner is not held by the SEO guard', r.status !== 403 || r.body?.code !== 'SEO_PANEL_ONLY', `${r.status}`);

// ---- live: SP-07's Start using (above)

r = await call('GET', `${P}/sidebar/admin/server`, null, st);
side = JSON.stringify(r.body || []);
ok('sidebar after live: Pages & SEO, Defaults, Analytics, Media, Connection', ['/t/seo', '/t/pages', '/site-setup?tab=seo', '/analytics', '/images', '/connection'].every(h => side.includes(`"${h}"`)), side);
ok('…no Setup', !side.includes('"/setup"'));
r = await call('GET', `${P}/seo`, null, st);
ok('after live: GET /seo opens', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', `${P}/pages`, null, st);
ok('after live: GET /pages opens', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', `${P}/analytics/summary`, null, st);
ok('after live: analytics opens', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('PUT', `${P}/site-config`, { seo: { metaTitle: 'Acme' } }, st);
ok('after live: SEO defaults save', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', `${P}/builder/models`, null, st);
ok('after live: models still 403', r.status === 403 && r.body?.code === 'SEO_PANEL_ONLY');

// ---- SP-09: the daily re-check, the Worker's ping, attention. Run the server with SEO_WATCH_MS=1500 and
// SEO_WATCH_RETRY_MS=100 so the schedule ticks and a site that doesn't answer is asked again quickly.
{
	const { ROOT } = await import('./lib.mjs');
	const mc = await new MongoClient(SMOKE_MONGO).connect();
	const db = mc.db();
	const pid = new ObjectId(seo._id);
	const settings = db.collection('websitesettings');
	const setConn = fields => settings.updateOne({ project: pid }, { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`connection.${k}`, v])) });
	const notices = type => db.collection('tenantnotifications').countDocuments({ project: pid, type });

	// The snippet way, the site gone but visits arrived in the last 3 days → still live.
	await setConn({ mode: 'script' });
	r = await call('POST', `${P}/seo-setup/recheck`, {}, st);
	ok('recheck (snippet way): site down but recent visits → live, by visits', r.status === 200 && r.body?.result?.ok === true && r.body.result.how === 'visits' && r.body.connection.status === 'live', JSON.stringify(r.body).slice(0, 300));
	await db.collection('websiteevents').deleteMany({ project: pid });
	r = await call('POST', `${P}/seo-setup/recheck`, {}, st);
	ok('…no visits and the site doesn’t answer → attention, with why', r.body?.connection?.status === 'attention' && /couldn’t open your site/.test(r.body.connection.attentionReason), JSON.stringify(r.body?.connection).slice(0, 300));
	ok('…the owner got one notification', (await notices('seo-attention')) === 1);
	r = await call('GET', `${P}/seo`, null, st);
	ok('attention: editing stays open (GET /seo 200)', r.status === 200, `${r.status}`);
	r = await call('GET', `${P}/sidebar/admin/server`, null, st);
	ok('attention: the full sidebar stays', JSON.stringify(r.body || []).includes('"/t/seo"'));
	r = await call('POST', `${P}/seo-setup/recheck`, {}, st);
	ok('…checked again, still failing: no second notification', r.body?.connection?.status === 'attention' && (await notices('seo-attention')) === 1);

	// The snippet back on the site → live again, and everyone hears it.
	const back = await serve(`<html><head><script src="https://api.example/public/track.js" data-key="${projectKey}" data-seo></script></head><body></body></html>`);
	await setConn({ siteUrl: `http://localhost:${back.address().port}` });
	r = await call('POST', `${P}/seo-setup/recheck`, {}, st);
	ok('…the snippet is back → live, by snippet, reason cleared', r.body?.connection?.status === 'live' && r.body.result.how === 'snippet' && !r.body.connection.attentionReason, JSON.stringify(r.body).slice(0, 300));
	ok('…a “connected again” notification', (await notices('seo-live')) === 1);

	// The Cloudflare way: no Worker header on the page, never pinged → attention.
	await setConn({ mode: 'cloudflare' });
	r = await call('POST', `${P}/seo-setup/recheck`, {}, st);
	ok('cloudflare: no Worker in front, never in touch → attention', r.body?.connection?.status === 'attention' && /Worker/.test(r.body.connection.attentionReason), JSON.stringify(r.body?.connection).slice(0, 300));
	// The Worker asks for its settings (its health ping), an older version.
	const ping = await fetch(`${ROOT}/public/api/site/edge?apiKey=${projectKey}`, { headers: { 'x-mint-edge': '0.9.0' } });
	ok('the Worker’s settings call still answers', ping.status === 200, `${ping.status}`);
	await new Promise(res => setTimeout(res, 300));
	r = await call('GET', `${P}/site-config`, null, st);
	ok('…its ping is noted: version 0.9.0, last seen, Mint’s latest', r.body?.connection?.edgeVersion === '0.9.0' && !!r.body.connection.edgeSeenAt && /^\d+\.\d+\.\d+$/.test(r.body.connection.edgeLatest || ''), JSON.stringify(r.body?.connection).slice(0, 400));
	r = await call('POST', `${P}/seo-setup/recheck`, {}, st);
	ok('…recheck: the Worker was in touch → live, by ping', r.body?.connection?.status === 'live' && r.body.result.how === 'ping', JSON.stringify(r.body).slice(0, 300));
	back.close();

	// The schedule: a check a day old is run by the server on its own.
	await setConn({ mode: 'script', lastCheckAt: new Date(Date.now() - 2 * 86400000), edgeSeenAt: null });
	let after = null;
	for (let i = 0; i < 20 && after?.status !== 'attention'; i++) {
		await new Promise(res => setTimeout(res, 500));
		after = (await settings.findOne({ project: pid }))?.connection;
	}
	ok('schedule: a day-old check runs on its own → attention', after?.status === 'attention' && Date.now() - new Date(after.lastCheckAt).getTime() < 60000, JSON.stringify(after).slice(0, 300));
	await setConn({ status: 'live', attentionReason: '' });
	r = await call('POST', `/tenant/api/p/${site._id}/seo-setup/recheck`, {}, t);
	ok('recheck on a site never set up → 409', r.status === 409, `${r.status}`);
	await mc.close();
}

// ---- SP-11: the demo login of an SEO project only looks (SEO_DEMO_PERMISSIONS)
r = await call('POST', `${P}/panel-admins/demo`, {}, t);
ok('SP-11: an SEO demo login is made with no role', r.status === 201 && !!r.body?.demo?.demoKey, JSON.stringify(r.body).slice(0, 200));
const demoKey = r.body?.demo?.demoKey;
r = await call('POST', '/tenant/api/panel/auth/demo', { key: demoKey });
ok('…its link at the commerce panel: use_seo', r.status === 400 && r.body?.code === 'use_seo', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/demo', { key: demoKey, app: 'seo' });
const dt = r.body?.token;
ok('…its link at Mint SEO → an hour’s token', r.status === 200 && !!dt && !!r.body?.expiresAt, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', '/tenant/api/panel/auth/self', null, dt);
const dkeys = r.body?.permissions || [];
ok('demo self: View only — sees pages, SEO, media, visits', r.body?.role?.name === 'View only' && ['view-seo', 'view-pages', 'view-image', 'view-analytics'].every(k => dkeys.includes(k)), JSON.stringify(r.body?.role) + JSON.stringify(dkeys));
ok('…and changes nothing: no edit, publish, manage-site, panel users', !dkeys.some(k => ['edit-pages', 'publish-seo', 'manage-site', 'build', 'manage-panel-users'].includes(k)), JSON.stringify(dkeys));
r = await call('GET', `${P}/seo`, null, dt);
ok('demo: GET /seo reads', r.status === 200, `${r.status}`);
r = await call('GET', `${P}/sidebar/admin/server`, null, dt);
side = JSON.stringify(r.body || []);
ok('demo sidebar: Pages & SEO + Analytics + Connection, no Redirects or Panel users', side.includes('"/t/seo"') && side.includes('"/analytics"') && side.includes('"/connection"') && !side.includes('"/panel-users"') && !side.includes('/redirects'), side.slice(0, 400));
for (const [m, path, body] of [
	['PUT', '/site-config', { edge: { bypass: true } }],
	['POST', '/seo-setup/disconnect', {}],
	['POST', '/seo-setup/recheck', {}],
	['POST', '/panel-users', { name: 'X', username: `x${stamp}`, password: 'seo-pass-1234' }],
]) {
	r = await call(m, `${P}${path}`, body, dt);
	ok(`demo: ${m} ${path} → 403`, r.status === 403, `${r.status} ${r.body?.message}`);
}
r = await call('GET', `${P}/site-config`, null, st);
ok('…the site is still live, the Worker not paused', r.body?.connection?.status === 'live' && r.body?.edge?.bypass !== true, JSON.stringify(r.body?.connection?.status));

// ---- SP-08: Disconnect
r = await call('PUT', `${P}/site-config`, { edge: { robots: true } }, st);
ok('after live: a Worker switch saves', r.status === 200 && r.body?.edge?.robots === true, JSON.stringify(r.body?.edge));
r = await call('POST', `${P}/seo-setup/disconnect`, {}, st);
ok('disconnect: status removed, step 1', r.status === 200 && r.body?.connection?.status === 'removed' && r.body.connection.step === 1, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', `${P}/sidebar/admin/server`, null, st);
side = JSON.stringify(r.body || []);
ok('after disconnect: the sidebar is the setup menu again', side.includes('"/setup"') && !side.includes('"/t/seo"'), side);
r = await call('GET', `${P}/seo`, null, st);
ok('after disconnect: GET /seo is held (409)', r.status === 409, `${r.status}`);
r = await call('POST', `${P}/seo-setup/detect`, { url: 'http://localhost:1' }, st);
ok('after disconnect: setup is still reachable', r.status !== 409 && r.status !== 403, `${r.status}`);
const c2 = await new MongoClient(SMOKE_MONGO).connect();
const edgeDoc = await c2.db().collection('websitesettings').findOne({ project: new ObjectId(seo._id) });
await c2.close();
ok('disconnect told the Worker to pass everything through', edgeDoc?.edge?.bypass === true, JSON.stringify(edgeDoc?.edge));

done();
