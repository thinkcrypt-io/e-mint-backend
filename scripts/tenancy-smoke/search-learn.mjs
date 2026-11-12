// Store search: learning (docs/search SI-16), on the real database. Six visitors search "dress" and keep opening the
// one shown last; learning lifts it for that search (and only that search), and lowers the first one they skip. They
// also search "frock", open nothing, and search "dress" a few seconds later: a synonym "frock → dress" is suggested,
// accepted, and "frock" then finds the dresses. A dismissed suggestion doesn't come back. Learning off: no lift, and
// the run is skipped.
//
// Needs a local SMOKE_MONGO and the backend started with SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000.
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) {
	console.log('SKIP  search-learn — set a local SMOKE_MONGO');
	process.exit(0);
}
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await sleep(400);
	}
};
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Lena Learn', email: `lena${stamp}@example.com`, password: 'tenant-pass-123', organization: `Learn ${stamp}`, country: 'BD' });
const t = r.body?.token;
const p = (await call('POST', '/tenant/api/projects', { name: 'Learning shop', type: 'ecommerce' }, t)).body;
const P = `/tenant/api/p/${p._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
ok('store ready', await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000));
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const made = {};
for (const [name, price] of [['Cotton dress', 900], ['Silk dress', 2400], ['Linen dress', 1500], ['Denim jacket', 3000], ['Party gown', 5000]])
	made[name] = String((await call('POST', `${P}/${inst.product.route}`, { name, price, status: 'active', productType: 'simple', trackStock: false }, t)).body?.doc?._id);
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === 5, 30000));

const key = await projectKey(p.publicSlug);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const pub = (path, q = {}) => `${ROOT}/public/api/${path}?${new URLSearchParams({ apiKey: key, ...q })}`;
const S = async (q, who) => (await fetch(pub('store/search', { q, ...who }), { headers: { 'user-agent': UA } })).json();
const beacon = body => fetch(pub('store/search/events'), { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': UA }, body: JSON.stringify(body) }).then(x => x.json());

const first = await S('dress', { visitor: `v0${stamp}` });
const order = first.doc.map(d => d.name);
ok('“dress” finds the three dresses', first.total === 3, order.join());
const top = first.doc[0];
const last = first.doc[2];

// Six visitors, four searches each: they open the last dress every time, never the first.
for (let v = 1; v <= 6; v++) {
	const who = { visitor: `v${v}${stamp}`, session: `s${v}${stamp}` };
	for (let k = 0; k < 4; k++) {
		const a = await S('dress', who);
		await beacon({ ...who, events: [{ type: 'click', searchId: a.searchId, product: String(last._id) }] });
	}
	// …and once: "frock" (nothing), then "dress" with a click, a few seconds apart.
	await S('frock', who);
	await sleep(50);
	const b = await S('dress', who);
	await beacon({ ...who, events: [{ type: 'click', searchId: b.searchId, product: String(last._id) }] });
	// "gown" then "jacket": a suggestion to dismiss later ("gown" finds the gown, so open nothing there).
	await S('jumper', who);
	const j = await S('jacket', who);
	await beacon({ ...who, events: [{ type: 'click', searchId: j.searchId, product: made['Denim jacket'] }] });
}
ok('the searches are logged', await waitFor(async () => (await db.collection('searchevents').countDocuments({ project: new ObjectId(p._id), type: 'search' })) >= 1 + 6 * 8), String(await db.collection('searchevents').countDocuments({ project: new ObjectId(p._id), type: 'search' })));
ok('…and the clicks', await waitFor(async () => (await db.collection('searchevents').countDocuments({ project: new ObjectId(p._id), type: 'click' })) === 36));

// Nothing learned yet: no lift.
let tr = await call('GET', `${C}/search/try?q=dress`, null, t);
ok('before learning: no “learned” in the explain', tr.status === 200 && !tr.body.doc.some(d => /learned/.test(d.explain || '')), tr.body?.doc?.map(d => d.explain).join(' | '));

r = await call('POST', `${C}/search/learn`, {}, t);
ok('learning runs: pairs over the thresholds, some lifted, suggestions made', r.status === 200 && r.body.pairs >= 3 && r.body.boosted >= 1 && r.body.suggestions >= 1, JSON.stringify(r.body));
const pairs = await db.collection('searchpairs').find({ project: new ObjectId(p._id), nq: 'dress' }).toArray();
const pairOf = id => pairs.find(x => String(x.product) === String(id));
ok('the dress they kept opening is lifted (≤ × 1.25)', pairOf(last._id)?.boost > 1 && pairOf(last._id).boost <= 1.25 && pairOf(last._id).impressions >= 20 && pairOf(last._id).visitors >= 5, JSON.stringify(pairOf(last._id)));
ok('…the one they skipped at the top is lowered (≥ × 0.85)', pairOf(top._id)?.boost < 1 && pairOf(top._id).boost >= 0.85, JSON.stringify(pairOf(top._id)));
ok('…where it was shown (position 1) as many clicks were expected as at position 3, or more', pairOf(top._id).expected >= pairOf(last._id).expected - 1e-6, `${pairOf(top._id).expected} vs ${pairOf(last._id).expected}`);
r = await call('GET', `${C}/search/status`, null, t);
ok('the status shows the last learning run', r.body?.learn?.pairs >= 3 && !!r.body.learn.at, JSON.stringify(r.body?.learn));

tr = await call('GET', `${C}/search/try?q=dress`, null, t);
ok('now the explain says “learned”, and the lifted dress moved up', tr.body.doc.find(d => String(d._id) === String(last._id))?.explain?.includes('learned ×') && tr.body.doc.findIndex(d => String(d._id) === String(last._id)) < 2, tr.body.doc.map(d => `${d.name}: ${d.explain}`).join(' | '));
tr = await call('GET', `${C}/search/try?q=silk%20dress`, null, t);
ok('…only for that search (“silk dress” learned nothing)', !tr.body.doc.some(d => /learned/.test(d.explain || '')));
const shopper = await S('dress', { visitor: `vx${stamp}` });
ok('shoppers get the same order', shopper.doc.findIndex(d => String(d._id) === String(last._id)) < 2, shopper.doc.map(d => d.name).join());

// Suggestions.
r = await call('GET', `${C}/search/suggestions`, null, t);
const frock = r.body?.doc?.find(s => s.key === 'synonym:frock>dress');
ok('a synonym is suggested: “frock” also finds “dress”, with why', r.status === 200 && frock && frock.status === 'open' && frock.source === 'learned' && frock.record.kind === 'one-way' && frock.record.words[0] === 'frock' && frock.record.to[0] === 'dress' && /6 shoppers/.test(frock.why), JSON.stringify(r.body).slice(0, 400));
const jumper = r.body?.doc?.find(s => s.key === 'synonym:jumper>jacket');
ok('…and “jumper → jacket”', !!jumper);
ok('typing on and adding words aren’t suggested', !r.body.doc.some(s => /dres>|>silk/.test(s.key)));
ok('the open count', r.body.open === r.body.doc.length && r.body.open >= 2);

let s0 = await S('frock', { visitor: `vy${stamp}` });
ok('before accepting, “frock” finds no dress', !s0.doc.some(d => /dress/i.test(d.name)) || !!s0.showing || s0.total === 0, JSON.stringify(s0.doc.map(d => d.name)));
r = await call('POST', `${C}/search/suggestions/${frock._id}/accept`, {}, t);
ok('accept: the synonym is made, marked “suggested”', r.status === 200 && r.body.kind === 'synonym' && !!r.body.made, JSON.stringify(r.body));
const syn = await db.collection(inst.searchSynonym.name.toLowerCase() + 's').findOne({ _id: new ObjectId(r.body.made) }).catch(() => null);
const synRow = syn || (await call('GET', `${P}/${inst.searchSynonym.route}/${r.body.made}`, null, t)).body?.doc || (await call('GET', `${P}/${inst.searchSynonym.route}/${r.body.made}`, null, t)).body;
ok('…its record', synRow?.source === 'suggested' && synRow.kind === 'one-way', JSON.stringify(synRow).slice(0, 300));
s0 = await S('frock', { visitor: `vy${stamp}` });
ok('…and “frock” now finds the dresses', s0.total === 3 && s0.doc.every(d => /dress/i.test(d.name)) && !s0.showing, JSON.stringify(s0.doc.map(d => d.name)));
r = await call('POST', `${C}/search/suggestions/${frock._id}/accept`, {}, t);
ok('accepting twice: 409', r.status === 409, `${r.status}`);
r = await call('POST', `${C}/search/suggestions/${jumper._id}/dismiss`, {}, t);
ok('dismiss', r.status === 200);
r = await call('POST', `${C}/search/learn`, {}, t);
r = await call('GET', `${C}/search/suggestions`, null, t);
ok('a dismissed one doesn’t come back, an accepted one isn’t made again', !r.body.doc.some(s => s.key === 'synonym:jumper>jacket' || s.key === 'synonym:frock>dress'), r.body.doc.map(s => s.key).join());
r = await call('GET', `${C}/search/suggestions?status=all`, null, t);
ok('…both are kept, decided', r.body.doc.find(s => s.key === 'synonym:jumper>jacket')?.status === 'dismissed' && r.body.doc.find(s => s.key === 'synonym:frock>dress')?.status === 'accepted');
r = await call('POST', `${C}/search/suggestions/nope/accept`, {}, t);
ok('an unknown one: 404', r.status === 404);

// Learning off.
await call('PUT', `${C}/search/settings`, { learning: false }, t);
tr = await call('GET', `${C}/search/try?q=dress`, null, t);
ok('learning off: no lift', tr.status === 200 && !tr.body.doc.some(d => /learned/.test(d.explain || '')), tr.body.doc.map(d => d.explain).join(' | '));
r = await call('POST', `${C}/search/learn`, {}, t);
ok('…and the run is skipped', r.status === 200 && !!r.body.skipped, JSON.stringify(r.body));
await call('PUT', `${C}/search/settings`, { learning: true, dials: { learned: 'off' } }, t);
tr = await call('GET', `${C}/search/try?q=dress`, null, t);
ok('the “learned” dial off: no lift either', !tr.body.doc.some(d => /learned/.test(d.explain || '')));

await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
await mc.close();
done();
