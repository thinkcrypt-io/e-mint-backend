// CMS-11 (docs/cms D7): scheduling — POST /<route>/:id/schedule sets, moves and clears publish at / take off at
// (checked: a date, in the future, at most two years ahead, take-off after publish, something to take off); the
// record and the content manager show them; the tick (CONTENT_TICK_MS on the test server) publishes the draft as it
// is then and takes it off, as the person who set it — History, the publish / unpublish webhooks (source
// "schedule") and their notification follow; a deleted record's job ends quietly, drafts turned off fails and says
// why; MCP publish_entry with `at` / `clear`; a project deleted takes its jobs. Also: a Publish click writes History.
// Stands alone.
import http from 'http';
import mongoose from 'mongoose';
import { call, ok, done, ROOT } from './lib.mjs';
await mongoose.connect(process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev');
const jobs = mongoose.connection.db.collection('contentschedules');

const got = [];
const server = http.createServer((req, res) => {
	let body = '';
	req.on('data', c => (body += c));
	req.on('end', () => {
		try {
			got.push(JSON.parse(body));
		} catch {}
		res.end('ok');
	});
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const RECV = `http://127.0.0.1:${server.address().port}`;

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sam Schedule', email: `sam${stamp}@example.com`, password: 'tenant-pass-123', organization: `Sam ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Journal ${stamp}`, type: 'app' }, T);
const proj = r.body;
ok('a project', r.status === 200 && proj?.publicSlug, `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${proj._id}${path}`;
const B = path => P(`/builder${path}`);
const pub = path => fetch(`${ROOT}/public/api/${proj.publicSlug}${path}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
const wait = ms => new Promise(res => setTimeout(res, ms));
const until = async (fn, ms = 20000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const v = await fn();
		if (v) return v;
		await wait(300);
	}
	return null;
};
const inSec = s => new Date(Date.now() + s * 1000).toISOString();

r = await call('POST', B('/models'), { name: 'Post', title: 'Posts', displayField: 'title', draftAndPublish: true, fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, T);
const post = r.body?.doc;
ok('a drafts model', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
await call('PUT', B(`/models/${post._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, T);
r = await call('POST', B('/models'), { name: 'Note', title: 'Notes', displayField: 'text', fields: [{ key: 'text', label: 'Text', kind: 'text' }] }, T);
const note = r.body?.doc;
r = await call('POST', P('/webhooks'), { route: post.route, events: ['publish', 'unpublish'], url: `${RECV}/hook` }, T);
ok('a publish webhook', r.status === 201, r.body?.message);

const S = id => P(`/${post.route}/${id}/schedule`);
r = await call('POST', P(`/${post.route}`), { title: 'Autumn menu' }, T);
const a = r.body?.doc;
r = await call('GET', P(`/${post.route}/${a._id}`), null, T);
ok('a record says it has nothing scheduled', r.body?._schedule && r.body._schedule.publishAt === null && r.body._schedule.unpublishAt === null, JSON.stringify(r.body?._schedule));

/* ---- checks */
r = await call('POST', S(a._id), {}, T);
ok('nothing sent → 400', r.status === 400 && /publishAt/.test(r.body?.message), r.body?.message);
r = await call('POST', S(a._id), { publishAt: 'next tuesday' }, T);
ok('not a date → 400', r.status === 400 && /isn’t a date/.test(r.body?.message), r.body?.message);
r = await call('POST', S(a._id), { publishAt: new Date(Date.now() - 60000).toISOString() }, T);
ok('in the past → 400', r.status === 400 && /future/.test(r.body?.message), r.body?.message);
r = await call('POST', S(a._id), { publishAt: new Date(Date.now() + 3 * 365 * 864e5).toISOString() }, T);
ok('three years ahead → 400', r.status === 400 && /two years/.test(r.body?.message), r.body?.message);
r = await call('POST', S(a._id), { unpublishAt: inSec(60) }, T);
ok('take off a record that isn’t live → 400', r.status === 400 && /isn’t on the site/.test(r.body?.message), r.body?.message);
r = await call('POST', S(a._id), { publishAt: inSec(120), unpublishAt: inSec(60) }, T);
ok('take off before publish → 400', r.status === 400 && /after Publish at/.test(r.body?.message), r.body?.message);
r = await call('POST', P(`/${note.route}/000000000000000000000000/schedule`), { publishAt: inSec(60) }, T);
ok('a model without drafts → 400', r.status === 400 && /Drafts and publishing is off/.test(r.body?.message), r.body?.message);
r = await call('POST', S('000000000000000000000000'), { publishAt: inSec(60) }, T);
ok('no such record → 404', r.status === 404, r.status);

/* ---- set, move, show */
r = await call('POST', S(a._id), { publishAt: inSec(300) }, T);
ok('publish at set', r.status === 200 && r.body?.schedule?.publishAt && r.body.schedule.publishBy === 'Sam Schedule', JSON.stringify(r.body));
r = await call('POST', S(a._id), { publishAt: inSec(4), unpublishAt: inSec(8) }, T);
ok('moved, and a take-off after it', r.status === 200 && r.body?.schedule?.publishAt && r.body.schedule.unpublishAt, JSON.stringify(r.body));
ok('…one waiting job per action', (await jobs.countDocuments({ record: new mongoose.Types.ObjectId(a._id), state: 'pending' })) === 2);
r = await call('GET', P(`/${post.route}/${a._id}`), null, T);
ok('the record shows both', !!r.body?._schedule?.publishAt && !!r.body._schedule.unpublishAt, JSON.stringify(r.body?._schedule));
r = await call('GET', P('/content'), null, T);
ok('the content manager lists what’s coming, soonest first', r.body?.scheduled?.length === 2 && r.body.scheduled[0].action === 'publish' && r.body.scheduled[0].name === 'Autumn menu' && r.body.scheduled[0].title === 'Posts', JSON.stringify(r.body?.scheduled));
r = await call('GET', P(`/${post.route}/${a._id}`), null, T);
ok('…not live yet', (await pub(`/${post.route}`)).body?.total === 0);
await call('PUT', P(`/${post.route}/${a._id}`), { title: 'Autumn menu, final' }, T);

/* ---- the tick */
r = await until(async () => ((await pub(`/${post.route}`)).body?.total === 1 ? await pub(`/${post.route}`) : null));
ok('published on time — the draft as it was then', r?.body?.doc?.[0]?.title === 'Autumn menu, final', JSON.stringify(r?.body));
const hookPub = await until(() => got.find(g => g.event === 'publish'), 5000);
ok('…the publish webhook, source schedule', hookPub?.source === 'schedule' && hookPub.record?.title === 'Autumn menu, final', JSON.stringify(hookPub));
r = await until(async () => {
	const x = await call('GET', P(`/history?route=${post.route}`), null, T);
	return (x.body?.doc || []).find(h => /published post Autumn menu, final as scheduled/.test(h.text)) ? x : null;
}, 5000);
ok('…History: published as scheduled, by who set it', !!r && (r.body.doc.find(h => /as scheduled/.test(h.text))?.userName === 'Sam Schedule'), JSON.stringify((r?.body?.doc || []).map(h => h.text)));
r = await until(async () => {
	const x = await call('GET', '/tenant/api/notifications', null, T);
	return (x.body?.doc || []).find(n => n.type === 'schedule-done' && /Published as scheduled/.test(n.title)) || null;
}, 5000);
ok('…and they hear about it', !!r && r.href === `/${proj.publicSlug}/${post.route}/${a._id}`, JSON.stringify(r));
r = await until(async () => ((await pub(`/${post.route}`)).body?.total === 0 ? true : null));
ok('taken off on time', !!r);
ok('…the unpublish webhook', !!(await until(() => got.find(g => g.event === 'unpublish' && g.source === 'schedule'), 5000)));
ok('…both jobs done', (await jobs.countDocuments({ record: new mongoose.Types.ObjectId(a._id), state: 'done' })) === 2);
r = await call('GET', P(`/${post.route}/${a._id}`), null, T);
ok('…nothing scheduled any more', r.body?._schedule?.publishAt === null && r.body._schedule.unpublishAt === null, JSON.stringify(r.body?._schedule));

/* ---- clear */
r = await call('POST', S(a._id), { publishAt: inSec(600) }, T);
r = await call('POST', S(a._id), { publishAt: null }, T);
ok('cleared', r.status === 200 && r.body?.message === 'Schedule cleared' && r.body.schedule.publishAt === null, JSON.stringify(r.body));
ok('…no job waits', (await jobs.countDocuments({ record: new mongoose.Types.ObjectId(a._id), state: 'pending' })) === 0);

/* ---- a deleted record: its job ends, nobody is told */
r = await call('POST', P(`/${post.route}`), { title: 'Gone soon' }, T);
const gone = r.body?.doc;
await call('POST', S(gone._id), { publishAt: inSec(3) }, T);
await call('DELETE', P(`/${post.route}/${gone._id}`), null, T);
r = await until(() => jobs.findOne({ record: new mongoose.Types.ObjectId(gone._id), state: 'failed' }));
ok('a deleted record’s job ends', /deleted/.test(r?.error || ''), JSON.stringify(r));
await wait(500);
r = await call('GET', '/tenant/api/notifications', null, T);
ok('…quietly', !(r.body?.doc || []).some(n => /Gone soon/.test(n.title)), JSON.stringify((r.body?.doc || []).map(n => n.title)));

/* ---- MCP */
r = await call('POST', P('/builder/api-keys'), { name: 'Publisher', scopes: ['read', 'build', 'data', 'publish'] }, T);
const key = r.body?.secret;
const tool = async (name, args = {}) => {
	const x = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
	return (await x.json().catch(() => null))?.result;
};
const text = res => res?.content?.[0]?.text || '';
const when = new Date(Date.now() + 3600e3).toISOString();
let res = await tool('publish_entry', { route: post.route, ids: [a._id], at: when });
ok('MCP: publish_entry with at schedules it', !res?.isError && /set to publish at/.test(text(res)), text(res));
ok('…not published now', (await pub(`/${post.route}`)).body?.total === 0);
res = await tool('get_entry', { route: post.route, id: a._id });
ok('…get_entry shows it', /Scheduled to publish at .* by Sam Schedule/.test(text(res)), text(res));
res = await tool('publish_entry', { route: post.route, ids: [a._id], at: '2001-01-01T00:00:00Z' });
ok('…a past time is refused', res?.isError && /future/.test(text(res)), text(res));
res = await tool('publish_entry', { route: post.route, ids: [a._id], clear: true });
ok('…and clear cancels it', !res?.isError && /no longer scheduled/.test(text(res)) && (await jobs.countDocuments({ record: new mongoose.Types.ObjectId(a._id), state: 'pending' })) === 0, text(res));

/* ---- a Publish click writes History now */
r = await call('POST', P(`/${post.route}/${a._id}/publish`), {}, T);
r = await until(async () => {
	const x = await call('GET', P(`/history?route=${post.route}`), null, T);
	return (x.body?.doc || []).find(h => h.text === 'Sam Schedule published post Autumn menu, final') || null;
}, 5000);
ok('Publish writes History', !!r, JSON.stringify(r));

/* ---- drafts turned off: the job fails and says why */
await call('POST', S(a._id), { unpublishAt: inSec(3) }, T);
r = await call('PUT', B(`/models/${post._id}`), { title: 'Posts', displayField: 'title', draftAndPublish: false, fields: post.fields }, T);
ok('drafts turned off', r.status === 200, JSON.stringify(r.body?.message || r.body?.problems));
r = await until(async () => {
	const x = await call('GET', '/tenant/api/notifications', null, T);
	return (x.body?.doc || []).find(n => n.type === 'schedule-failed') || null;
});
ok('…the job fails, and they hear why', !!r && /Couldn’t take off/.test(r.title) && /turned off/.test(r.message), JSON.stringify(r));

/* ---- a deleted project takes its jobs */
await call('PUT', B(`/models/${post._id}`), { title: 'Posts', displayField: 'title', draftAndPublish: true, fields: post.fields }, T);
r = await call('POST', S(a._id), { unpublishAt: inSec(900) }, T);
ok('scheduled again', r.status === 200, r.body?.message);
r = await call('DELETE', `/tenant/api/projects/${proj._id}?force=1`, null, T);
ok('project deleted', r.status === 200, r.body?.message);
ok('…its jobs too', (await jobs.countDocuments({ project: new mongoose.Types.ObjectId(proj._id) })) === 0);

server.close();
await mongoose.disconnect();
done();
