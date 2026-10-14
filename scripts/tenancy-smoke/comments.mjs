// WO-49: comments and @mentions on a project's records — who can be mentioned
// follows who can see the record (public / private / only me), the project's
// Comments and Mentions switches, notifications, and editing/deleting.
// Stands alone (its own accounts). Local scratch server only.
import mongoose from 'mongoose';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const PASS = 'comment-pass-123';
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const MONGO = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
await mongoose.connect(MONGO);
const email = key => `${key}${stamp}@example.com`;
const register = async (name, key) =>
	(await call('POST', '/tenant/api/auth/register', { name, email: email(key), password: PASS, organization: `${name} Co ${stamp}`, country: 'BD' })).body.token;
const settle = () => new Promise(r => setTimeout(r, 400));

// Alma owns the project; Bea and Cy are invited into it as Members.
const alma = await register('Alma', 'alma');
let bea = await register('Bea', 'bea');
let cy = await register('Cy', 'cy');
await mongoose.connection.db.collection('tenantusers').updateMany({ email: { $in: [email('bea'), email('cy')] } }, { $set: { emailVerified: true } });
const shop = (await call('POST', '/tenant/api/projects', { name: 'Shop', type: 'app' }, alma)).body;
const join = async token => {
	const inv = (await call('GET', '/tenant/api/invitations/for-me', null, token)).body?.doc?.[0];
	return (await call('POST', `/tenant/api/invitations/for-me/${inv?._id}/accept`, null, token)).body?.token;
};
await call('POST', P(shop._id, '/people/invitations'), { email: email('bea'), role: 'member' }, alma);
await call('POST', P(shop._id, '/people/invitations'), { email: email('cy'), role: 'member' }, alma);
bea = await join(bea);
cy = await join(cy);
ok('Bea and Cy are in Shop', !!bea && !!cy);
const self = async t => (await call('GET', '/tenant/api/auth/self', null, t)).body;
const beaId = (await self(bea))?._id;
const cyId = (await self(cy))?._id;

let r = await call('POST', P(shop._id, '/builder/models'), { name: 'Note', title: 'Notes', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, alma);
ok('a model without per-record access', r.status === 201, r.body?.message);
r = await call('POST', P(shop._id, '/builder/models'), { name: 'Deal', title: 'Deals', access: { enabled: true }, fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, alma);
ok('a model with per-record access', r.status === 201, r.body?.message);
const add = async (route, body) => { const b = (await call('POST', P(shop._id, `/${route}`), body, alma)).body; return b?._id || b?.doc?._id; };
const note = await add('notes', { title: 'Opening hours' });
const pub = await add('deals', { title: 'Open deal', privacy: 'public' });
const priv = await add('deals', { title: 'Quiet deal', privacy: 'private', access: [beaId] });
const mine = await add('deals', { title: 'My deal', privacy: 'only-me' });
ok('records made', !!note && !!pub && !!priv && !!mine);
const C = (route, record) => `/comments?route=${route}&record=${record}`;
const M = (route, record) => `/comments/mentionable?route=${route}&record=${record}`;
const post = (route, record, body, mentions = [], who = alma) => call('POST', P(shop._id, '/comments'), { route, record, body, mentions }, who);

/* ---- a page without per-record access: everyone on the page */
r = await call('GET', P(shop._id, M('notes', note)), null, alma);
ok('anyone in the project can be mentioned on a note', r.body?.enabled === true && r.body?.mode === 'everyone' && r.body?.people?.length === 2 && !r.body.people.some(p => p.email === email('alma')), JSON.stringify(r.body));
r = await post('notes', note, '@Bea can you check this?', [beaId]);
ok('comment with a mention', r.status === 200 && r.body?.mentions?.[0]?._id === beaId && r.body?.author?.name === 'Alma', JSON.stringify(r.body));
const first = r.body?._id;
await settle();
r = await call('GET', '/tenant/api/notifications', null, bea);
const n = r.body?.doc?.find(x => x.type === 'mention');
ok('Bea is notified, with a link to the Comments tab', !!n && /Alma mentioned you on Note “Opening hours”/.test(n.title) && /\/notes\/.+\?tab=comments$/.test(n.href || ''), JSON.stringify(n));
r = await call('GET', '/tenant/api/notifications', null, cy);
ok('Cy, not mentioned, is not', !(r.body?.doc || []).some(x => x.type === 'mention'));
r = await call('GET', P(shop._id, C('notes', note)), null, cy);
ok('everyone on the page reads the thread', r.status === 200 && r.body?.total === 1 && r.body?.settings?.mentions === true && r.body?.canModerate === false, JSON.stringify(r.body));

/* ---- a public record of a restricted page */
r = await call('GET', P(shop._id, M('deals', pub)), null, alma);
ok('public deal: everyone', r.body?.mode === 'everyone' && r.body?.people?.length === 2);

/* ---- private: only the owner and who it's shared with */
r = await call('GET', P(shop._id, M('deals', priv)), null, alma);
ok('private deal: Bea can be mentioned, Cy is listed as blocked', r.body?.mode === 'private' && r.body?.people?.map(p => p._id).join() === beaId && r.body?.blocked?.map(p => p._id).join() === cyId, JSON.stringify(r.body));
r = await post('deals', priv, 'For @Bea', [beaId]);
ok('mention Bea on it', r.status === 200, r.body?.message);
r = await post('deals', priv, 'And @Cy', [cyId]);
ok('mentioning Cy is refused, by name', r.status === 400 && /Cy can’t be mentioned — this record is private/.test(r.body?.message), r.body?.message);
r = await call('GET', P(shop._id, C('deals', priv)), null, cy);
ok("Cy can't read a private deal's comments (404)", r.status === 404, r.status);
r = await post('deals', priv, 'Sneaky', [], cy);
ok("…or comment on it", r.status === 404, r.status);
r = await call('GET', P(shop._id, M('deals', priv)), null, bea);
ok('Bea on the private deal: Alma (the owner) can be mentioned', r.body?.people?.some(p => p.email === email('alma')) && !r.body.people.some(p => p._id === cyId), JSON.stringify(r.body?.people));

/* ---- only me: no one */
r = await call('GET', P(shop._id, M('deals', mine)), null, alma);
ok('only-me deal: nobody', r.body?.mode === 'none' && r.body?.people?.length === 0, JSON.stringify(r.body));
r = await post('deals', mine, 'Hey @Bea', [beaId]);
ok('mentioning on an only-me record is refused', r.status === 400 && /Only me — no one else can see it/.test(r.body?.message), r.body?.message);
r = await post('deals', mine, 'A note to myself');
ok('…a plain comment is fine', r.status === 200, r.body?.message);

/* ---- editing and deleting */
r = await call('PUT', P(shop._id, `/comments/${first}`), { body: 'Taken over' }, bea);
ok("Bea can't edit Alma's comment", r.status === 403, r.status);
r = await call('PUT', P(shop._id, `/comments/${first}`), { body: '@Bea and @Cy please', mentions: [beaId, cyId] }, alma);
ok('Alma edits hers, adding Cy', r.status === 200 && !!r.body?.editedAt && r.body?.mentions?.length === 2, JSON.stringify(r.body));
await settle();
r = await call('GET', '/tenant/api/notifications', null, cy);
ok('Cy is told; Bea is not told twice', (r.body?.doc || []).filter(x => x.type === 'mention').length === 1);
r = await call('GET', '/tenant/api/notifications', null, bea);
ok('Bea has two mentions: the note and the private deal', (r.body?.doc || []).filter(x => x.type === 'mention').length === 2, (r.body?.doc || []).filter(x => x.type === 'mention').length);
r = await call('DELETE', P(shop._id, `/comments/${first}`), null, bea);
ok("Bea can't delete it", r.status === 403, r.status);

/* ---- the switches */
r = await call('PUT', `/tenant/api/projects/${shop._id}`, { collaboration: { mentions: false } }, alma);
ok('mentions off', r.status === 200 && r.body?.collaboration?.mentions === false && r.body?.collaboration?.comments === true, JSON.stringify(r.body?.collaboration));
r = await call('GET', P(shop._id, M('notes', note)), null, alma);
ok('mentionable says off', r.body?.enabled === false && r.body?.people?.length === 0);
r = await post('notes', note, 'Hi @Bea', [beaId]);
ok('a mention is refused while off', r.status === 400 && /Mentions are turned off/.test(r.body?.message), r.body?.message);
r = await post('notes', note, 'Plain comment');
ok('…plain comments still work', r.status === 200);
r = await call('PUT', `/tenant/api/projects/${shop._id}`, { collaboration: { comments: false } }, alma);
r = await post('notes', note, 'Anyone?');
ok('comments off: refused', r.status === 403 && /Comments are turned off/.test(r.body?.message), r.body?.message);
r = await call('DELETE', P(shop._id, `/comments/${first}`), null, alma);
ok('the author can still delete', r.status === 200, r.body?.message);
r = await call('PUT', `/tenant/api/projects/${shop._id}`, { collaboration: { comments: true, mentions: true } }, bea);
ok("Bea can't change the switches", r.status === 403, r.status);

/* ---- deleting the project takes its comments */
r = await call('DELETE', `/tenant/api/projects/${shop._id}?force=1`, null, alma);
ok('project deleted', r.status === 200, r.body?.message);
const left = await mongoose.connection.db.collection('recordcomments').countDocuments({ project: new mongoose.Types.ObjectId(shop._id) });
ok('…with its comments', left === 0, left);

await mongoose.disconnect();
done();
