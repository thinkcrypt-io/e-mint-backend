// CMS-13 (docs/cms D12): media details — a library file's alt text, caption and focal point (PATCH
// media/files/:id, checked); image fields "with details" answer { url, alt, caption, width, height, focal } on the
// public API, inside components too, unknown addresses blank, other image fields plain; the render API sends the
// page's pictures' alt and focal point (media). Files are put in the database directly (no S3). Stands alone.
import mongoose from 'mongoose';
import { call, ok, done, ROOT } from './lib.mjs';
await mongoose.connect(process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev');
const stamp = Date.now();

let r = await call('POST', '/tenant/api/auth/register', { name: 'Mia Media', email: `mia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Mia ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Bakery ${stamp}`, type: 'website' }, T);
const site = r.body;
ok('a website project', r.status === 200 && site?.publicSlug, `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const B = path => P(`/builder${path}`);
const pub = path => fetch(`${ROOT}/public/api/${site.publicSlug}${path}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));

/* ---- library files (as an upload makes them) */
const project = await mongoose.connection.db.collection('tenantprojects').findOne({ _id: new mongoose.Types.ObjectId(site._id) });
const file = (name, w, h) => ({
	name, url: `https://media.example.com/${stamp}/${name}`, key: `${stamp}/${name}`, type: 'image/jpeg', fileType: 'image', folder: 'default', size: 1000,
	width: w, height: h, isActive: true, trashedAt: null, trashRoot: null, organization: project.organization, project: project._id, createdAt: new Date(), updatedAt: new Date(),
});
const files = mongoose.connection.db.collection('adminfiles');
const { insertedIds } = await files.insertMany([file('loaf.jpg', 1600, 900), file('shop.jpg', 1200, 800), file('plain.jpg', 800, 800)]);
const [loafId, shopId] = Object.values(insertedIds).map(String);
const url = n => `https://media.example.com/${stamp}/${n}`;

r = await call('PATCH', P(`/media/files/${loafId}`), { alt: '  A sourdough loaf on a board ', caption: 'Baked this morning', focal: { x: 0.3333, y: 0.7 } }, T);
ok('alt text, caption and focal point saved', r.status === 200 && r.body?.doc?.alt === 'A sourdough loaf on a board' && r.body.doc.caption === 'Baked this morning' && r.body.doc.focal?.x === 0.333 && r.body.doc.focal?.y === 0.7, JSON.stringify(r.body));
r = await call('PATCH', P(`/media/files/${loafId}`), { focal: { x: 1.5, y: 0.2 } }, T);
ok('a focal point outside the picture is refused', r.status === 400 && /0 to 1/.test(r.body?.message), JSON.stringify(r.body));
r = await call('PATCH', P(`/media/files/${loafId}`), { alt: 'x'.repeat(301) }, T);
ok('…and alt text over 300 characters', r.status === 400, r.status);
r = await call('PATCH', P(`/media/files/${loafId}`), {}, T);
ok('…and nothing to change', r.status === 400, r.status);
r = await call('PATCH', P(`/media/files/${shopId}`), { name: 'Shop front.jpg' }, T);
ok('renaming still works', r.status === 200 && r.body?.message === 'File renamed' && r.body.doc.name === 'Shop front.jpg', JSON.stringify(r.body?.message));
r = await call('PATCH', P(`/media/files/${shopId}`), { focal: { x: 0.5, y: 0.1 } }, T);
r = await call('GET', P('/media/browse'), null, T);
ok('the library lists them with their details', (r.body?.files || []).some(f => f._id === loafId && f.alt && f.focal?.x === 0.333), JSON.stringify((r.body?.files || []).map(f => [f.name, f.alt, f.focal])));

/* ---- image fields with details */
r = await call('POST', B('/components'), { category: 'shared', name: `banner${stamp % 100000}`, title: 'Banner', fields: [
	{ key: 'heading', label: 'Heading', kind: 'text' },
	{ key: 'photo', label: 'Photo', kind: 'image', details: true },
] }, T);
const banner = r.body?.doc || r.body;
ok('a component with an image with details', !!banner?.uid && banner.fields?.find(f => f.key === 'photo')?.details === true, JSON.stringify(r.body).slice(0, 200));
r = await call('POST', B('/models'), { name: 'Product', title: 'Products', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text' },
	{ key: 'photo', label: 'Photo', kind: 'image', details: true },
	{ key: 'gallery', label: 'Gallery', kind: 'images', details: true },
	{ key: 'thumb', label: 'Thumbnail', kind: 'image' },
	{ key: 'banner', label: 'Banner', kind: 'component', component: banner.uid },
] }, T);
const product = r.body?.doc;
ok('a model with image fields with details', r.status === 201 && product?.fields?.find(f => f.key === 'photo')?.details === true && !product.fields.find(f => f.key === 'thumb')?.details, JSON.stringify(r.body?.problems || r.body?.message));
await call('PUT', B(`/models/${product._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, T);
r = await call('POST', P(`/${product.route}`), { name: 'Sourdough', photo: url('loaf.jpg'), gallery: [url('shop.jpg'), 'https://elsewhere.example.com/x.jpg'], thumb: url('loaf.jpg'), banner: { heading: 'Fresh', photo: url('shop.jpg') } }, T);
const rec = r.body?.doc;
ok('records keep the address', rec?.photo === url('loaf.jpg') && rec?.gallery?.length === 2, JSON.stringify(rec).slice(0, 200));

r = await pub(`/${product.route}/${rec._id}`);
const one = r.body;
ok('the API: the picture with its details', one?.photo?.url === url('loaf.jpg') && one.photo.alt === 'A sourdough loaf on a board' && one.photo.caption === 'Baked this morning' && one.photo.width === 1600 && one.photo.height === 900 && one.photo.focal?.x === 0.333, JSON.stringify(one?.photo));
ok('…a list of pictures each with theirs, one not in the library blank', one?.gallery?.[0]?.focal?.y === 0.1 && one.gallery[1]?.url === 'https://elsewhere.example.com/x.jpg' && one.gallery[1].alt === '' && one.gallery[1].width === null && one.gallery[1].focal === null, JSON.stringify(one?.gallery));
ok('…inside a component too', one?.banner?.photo?.url === url('shop.jpg') && one.banner.photo.focal?.x === 0.5 && one.banner.heading === 'Fresh', JSON.stringify(one?.banner));
ok('…and a field without it stays an address', one?.thumb === url('loaf.jpg'), JSON.stringify(one?.thumb));
r = await pub(`/${product.route}`);
ok('lists too', r.body?.doc?.[0]?.photo?.alt === 'A sourdough loaf on a board', JSON.stringify(r.body?.doc?.[0]?.photo));
await call('PATCH', P(`/media/files/${loafId}`), { alt: 'A fresh sourdough loaf' }, T);
r = await pub(`/${product.route}/${rec._id}`);
ok('fixing the alt text in the library fixes it everywhere', r.body?.photo?.alt === 'A fresh sourdough loaf', r.body?.photo?.alt);
r = await call('GET', P(`/${product.route}/${rec._id}`), null, T);
ok('the panel still edits the address', (r.body?.doc || r.body)?.photo === url('loaf.jpg'), JSON.stringify((r.body?.doc || r.body)?.photo));

/* ---- the site: the render API sends the page's pictures' details */
r = await call('POST', P('/builder/api-keys'), { name: 'Claude publishes', scopes: ['read', 'build', 'publish'] }, T);
const key = r.body?.secret;
const tool = async (name, args = {}) => {
	const x = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
	return (await x.json().catch(() => null))?.result;
};
let res = await tool('save_site_page', { path: '/', tree: [
	{ type: 'section', style: { base: { bgImage: url('shop.jpg') } }, children: [{ type: 'image', props: { src: url('loaf.jpg'), ratio: '16/9' } }] },
	{ type: 'image', props: { src: url('plain.jpg') } },
] });
ok('a page with library pictures', !res?.isError, res?.content?.[0]?.text?.slice(0, 160));
ok('…the site check counts the library’s alt text: only the picture without one is flagged', (res?.content?.[0]?.text?.match(/no alt text/g) || []).length === 1, res?.content?.[0]?.text);
res = await tool('publish_site', {});
ok('published', !res?.isError, res?.content?.[0]?.text?.slice(0, 160));
r = await pub(`/render?path=${encodeURIComponent('/')}`);
const media = r.body?.media || {};
ok('render: alt text and focal point by address', media[url('loaf.jpg')]?.alt === 'A fresh sourdough loaf' && media[url('loaf.jpg')]?.focal?.x === 0.333 && media[url('shop.jpg')]?.focal?.y === 0.1, JSON.stringify(media));
ok('…only the pictures that have details', !(url('plain.jpg') in media), Object.keys(media).join(' '));

r = await call('DELETE', `/tenant/api/projects/${site._id}?force=1`, null, T);
ok('project deleted', r.status === 200, r.body?.message);
await files.deleteMany({ key: { $regex: `^${stamp}/` } });
await mongoose.disconnect();
done();
