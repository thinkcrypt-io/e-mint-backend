// Business details on the organization and each project (docs/pdf-templates
// D14, D15, D18): the organization's profile, a new project starting with it,
// the project's own from then on, an older project showing the organization's,
// PDF settings reading and writing the project's, the sidebar inside a project,
// organization-level uploads. Stands alone (its own accounts). Local scratch server only.
import mongoose from 'mongoose';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const PASS = 'business-pass-123';
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const MONGO = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
if (!/127\.0\.0\.1|localhost/.test(MONGO)) throw new Error('SMOKE_MONGO must be a local scratch database');

let r = await call('POST', '/tenant/api/auth/register', { name: 'Bea Owner', email: `bea${stamp}@example.com`, password: PASS, organization: `Beta ${stamp}`, country: 'BD' });
const bea = r.body?.token;
ok('registered', !!bea, r.body?.message);

/* ---- the organization's details */
r = await call('PUT', '/tenant/api/org', { logo: 'https://example.com/beta.png', business: { name: 'Beta Trading Ltd', address: 'Gulshan 2, Dhaka', phone: '+880 1700 000000', email: 'hello@beta.example', taxId: 'BIN 123' } }, bea);
ok('organization saves its business details', r.status === 200 && r.body?.business?.address === 'Gulshan 2, Dhaka' && r.body?.business?.logo === 'https://example.com/beta.png', JSON.stringify(r.body?.business));
r = await call('PUT', '/tenant/api/org', { business: { phone: 'x'.repeat(61) } }, bea);
ok('too long a phone is refused', r.status === 400, r.status);

/* ---- a new project starts with them */
const shop = (await call('POST', '/tenant/api/projects', { name: 'Shop', type: 'app' }, bea)).body;
r = await call('GET', `/tenant/api/projects/${shop._id}`, null, bea);
ok('a new project starts with the organization’s details', r.body?.business?.name === 'Beta Trading Ltd' && r.body?.business?.logo === 'https://example.com/beta.png' && r.body?.business?.taxId === 'BIN 123', JSON.stringify(r.body?.business));

r = await call('PUT', `/tenant/api/projects/${shop._id}`, { business: { name: 'Beta Shop', address: 'Banani, Dhaka' } }, bea);
ok('the project changes its own', r.status === 200 && r.body?.business?.name === 'Beta Shop' && r.body?.business?.phone === '+880 1700 000000', JSON.stringify(r.body?.business));
await call('PUT', '/tenant/api/org', { business: { address: 'Moved, Chattogram' } }, bea);
r = await call('GET', `/tenant/api/projects/${shop._id}`, null, bea);
ok('the organization changing doesn’t reach it', r.body?.business?.address === 'Banani, Dhaka', r.body?.business?.address);

/* ---- a project from before shows the organization's until saved */
const old = (await call('POST', '/tenant/api/projects', { name: 'Old', type: 'app' }, bea)).body;
await mongoose.connect(MONGO);
await mongoose.connection.db.collection('tenantprojects').updateOne({ _id: new mongoose.Types.ObjectId(old._id) }, { $unset: { business: 1 } });
r = await call('GET', `/tenant/api/projects/${old._id}`, null, bea);
ok('an older project shows the organization’s', r.body?.business?.address === 'Moved, Chattogram', JSON.stringify(r.body?.business));

/* ---- PDFs print the project's */
r = await call('GET', P(shop._id, '/pdf-templates/settings'), null, bea);
ok('PDF settings in a project carry its details', r.status === 200 && r.body?.business?.name === 'Beta Shop' && r.body?.business?.address === 'Banani, Dhaka', JSON.stringify(r.body?.business));
r = await call('PUT', P(shop._id, '/pdf-templates/settings'), { ...r.body, business: { ...r.body.business, logo: 'https://example.com/shop.png', note: 'Bank: City Bank 123' }, texts: [{ label: 'Terms', text: 'Pay in 7 days' }] }, bea);
ok('saving them from the PDF designer…', r.status === 200 && r.body?.business?.logo === 'https://example.com/shop.png' && r.body?.business?.note === 'Bank: City Bank 123' && r.body?.texts?.[0]?.key === 'terms', JSON.stringify(r.body?.business));
r = await call('GET', `/tenant/api/projects/${shop._id}`, null, bea);
ok('…changes the project’s (Project settings shows it)', r.body?.business?.logo === 'https://example.com/shop.png' && !('note' in (r.body?.business || {})), JSON.stringify(r.body?.business));
const stored = await mongoose.connection.db.collection('pdfsettings').findOne({ project: new mongoose.Types.ObjectId(shop._id) });
ok('PdfSettings keeps only the bank note of the details', stored?.data?.business?.name === '' && stored?.data?.business?.note === 'Bank: City Bank 123', JSON.stringify(stored?.data?.business));

/* ---- the sidebar */
r = await call('GET', '/tenant/api/sidebar/crm/generic', null, bea);
const outside = JSON.stringify(r.body || []);
ok('outside a project: Organization → Settings, no project settings', outside.includes('/org/settings') && !outside.includes('/project-settings'));
r = await call('GET', P(shop._id, '/sidebar/crm/server'), null, bea);
const inside = JSON.stringify(r.body || []);
ok('inside a project: its Settings, not the organization’s', inside.includes('/project-settings') && !inside.includes('/org/settings'), r.status);

/* ---- organization-level files */
r = await call('POST', '/tenant/api/upload', {}, bea);
ok('organization upload route answers (no file sent)', r.status !== 404 && r.status !== 403, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', '/tenant/api/media/tree', null, bea);
ok('organization media library answers', r.status !== 404, r.status);
r = await call('POST', '/tenant/api/upload', {}, null);
ok('not signed in: refused', r.status === 401, r.status);

await mongoose.disconnect();
done();
