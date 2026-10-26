// The panel's SEO records edited with the SEO editor (docs/site-builder SB-32):
// the kit's SEO model has an `seo` field (kind seo, the AGS VSeo object) beside
// its six plain fields. A panel save of the object fills the plain fields and
// reaches the page's SEO in full (social, indexing, structured data, sitemap);
// a builder save fills the object; a plain-field save through the API keeps the
// object in step; and a project made before SB-32 is upgraded when its site opens.
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Ada Panel', email: `seopanel${stamp}@example.com`, password: 'tenant-pass-123', organization: `Seo Panel ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Panel ${stamp}`, type: 'website' }, T);
const site = r.body;
ok('a website project', r.status === 200 && site?._id, `${r.status} ${r.body?.message}`);
const SB = path => `/tenant/api/p/${site._id}/site-builder${path}`;
const P = path => `/tenant/api/p/${site._id}${path}`;

r = await call('GET', SB('/design'), null, T);
ok('the site opens', r.status === 200, `${r.status} ${r.body?.message}`);
const seoModel = async () => ((await call('GET', P('/builder/models'), null, T)).body?.doc || []).find(m => m.route === 'seo');
let def = await seoModel();
ok('the SEO model has the SEO editor field', def?.fields?.some(f => f.key === 'seo' && f.kind === 'seo'), JSON.stringify(def?.fields?.map(f => `${f.key}:${f.kind}`)));
const formOf = async () => {
	const c = (await call('GET', P('/seo/get/config'), null, T)).body || {};
	return JSON.stringify((c.doc || c).form || []);
};
let form = await formOf();
ok('…its form is the editor, without the plain fields', form.includes('"seo"') && !form.includes('"description"') && !form.includes('"title"'), form);

r = await call('GET', SB('/pages'), null, T);
const home = r.body.pages.find(p => p.isHome);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
r = await call('PUT', SB(`/pages/${home.id}`), { rev: r.body.draft.rev, seo: { title: 'Home | Panel', description: 'From the builder.', ogDescription: 'Builder share text', schemaType: 'LocalBusiness' } }, T);
ok('the builder saves the page’s SEO', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);

r = await call('GET', P('/seo'), null, T);
let rec = (r.body?.doc || []).find(x => x.title === 'Home | Panel');
ok('the SEO record has the editor’s object, from the builder', rec?.seo?.metaTitle === 'Home | Panel' && rec.seo.ogDescription === 'Builder share text' && rec.seo.schemaType === 'LocalBusiness', JSON.stringify(rec).slice(0, 400));

const edited = {
	...rec.seo,
	metaTitle: 'Study abroad from Dhaka | Panel',
	metaDescription: 'Edited with the SEO editor in the panel: counselling, applications and visas for students in Bangladesh.',
	ogTitle: 'Share title from the panel',
	ogImage: 'https://cdn.example.com/panel-og.jpg',
	ogImageAlt: 'Students on a campus',
	twitterCard: 'summary',
	robots: { ...(rec.seo.robots || {}), index: false, noArchive: true, maxSnippet: 120 },
	sitemap: { include: true, priority: 0.9, changeFrequency: 'daily' },
};
r = await call('PUT', P(`/seo/${rec._id}`), { seo: edited }, T);
ok('the panel saves the editor’s object', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', P(`/seo/${rec._id}`), null, T);
rec = r.body?.doc || r.body;
ok('…its plain fields follow it', rec?.title === edited.metaTitle && rec.description === edited.metaDescription && rec.image === edited.ogImage && rec.noIndex === true, JSON.stringify(rec).slice(0, 400));

r = await call('GET', SB(`/pages/${home.id}`), null, T);
const pageSeo = r.body?.draft?.seo || {};
ok('…and the page takes all of it', pageSeo.title === edited.metaTitle && pageSeo.ogTitle === edited.ogTitle && pageSeo.ogImageAlt === edited.ogImageAlt && pageSeo.twitterCard === 'summary' && pageSeo.noIndex === true && pageSeo.noArchive === true && pageSeo.maxSnippet === 120 && pageSeo.sitemapPriority === 0.9 && pageSeo.sitemapChangeFrequency === 'daily' && pageSeo.schemaType === 'LocalBusiness', JSON.stringify(pageSeo).slice(0, 500));

r = await call('PUT', P(`/seo/${rec._id}`), { description: 'A plain-field edit through the API.' }, T);
ok('a plain-field save', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', P(`/seo/${rec._id}`), null, T);
rec = r.body?.doc || r.body;
ok('…keeps the editor’s object in step and the rest of it', rec?.seo?.metaDescription === 'A plain-field edit through the API.' && rec.seo.ogTitle === edited.ogTitle && rec.seo.robots?.noArchive === true, JSON.stringify(rec?.seo).slice(0, 400));

/* ------------------------------------------- a project made before SB-32 */
const fieldsOf = d => d.fields.map(({ _id, ...f }) => f);
const old = fieldsOf(def)
	.filter(f => f.key !== 'seo')
	.map(f => (['title', 'description'].includes(f.key) ? { ...f, required: true } : f));
r = await call('PUT', P(`/builder/models/${def._id}`), { ...def, fields: old }, T);
ok('(the SEO model put back to its old shape)', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message || '').slice(0, 300)}`);
r = await call('POST', P('/seo'), { page: rec.page?._id || rec.page, title: 'An old record', description: 'Made before the SEO editor.' }, T);
const oldRec = r.body?.doc || r.body;
ok('(an old-style record)', [200, 201].includes(r.status) && oldRec?._id, `${r.status} ${r.body?.message}`);

r = await call('GET', SB('/design'), null, T);
def = await seoModel();
ok('opening the site upgrades the SEO model', def?.fields?.some(f => f.key === 'seo' && f.kind === 'seo') && !def.fields.find(f => f.key === 'title')?.required, JSON.stringify(def?.fields?.map(f => `${f.key}:${f.kind}${f.required ? '!' : ''}`)));
r = await call('GET', P(`/seo/${oldRec._id}`), null, T);
const up = r.body?.doc || r.body;
form = await formOf();
ok('…keeps the editor as the form (published once, not again)', form.includes('"seo"'), form);
ok('…and gives old records the editor’s object', up?.seo?.metaTitle === 'An old record' && up.seo.metaDescription === 'Made before the SEO editor.', JSON.stringify(up?.seo).slice(0, 300));

/* ---------- an old project whose SEO page is opened without the builder */
r = await call('POST', '/tenant/api/projects', { name: `Panel only ${stamp}`, type: 'website' }, T);
const site2 = r.body;
const P2 = path => `/tenant/api/p/${site2._id}${path}`;
const def2 = ((await call('GET', P2('/builder/models'), null, T)).body?.doc || []).find(m => m.route === 'seo');
r = await call('PUT', P2(`/builder/models/${def2._id}`), { ...def2, fields: fieldsOf(def2).filter(f => f.key !== 'seo').map(f => (['title', 'description'].includes(f.key) ? { ...f, required: true } : f)) }, T);
ok('(a second project’s SEO model in its old shape, its builder never opened)', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message || '').slice(0, 200)}`);
const c2 = (await call('GET', P2('/seo/get/config'), null, T)).body || {};
const form2 = JSON.stringify((c2.doc || c2).form || []);
ok('opening its SEO page upgrades it first: the form is the editor', form2.includes('"seo"') && !form2.includes('"description"'), form2.slice(0, 300));
const def2b = ((await call('GET', P2('/builder/models'), null, T)).body?.doc || []).find(m => m.route === 'seo');
ok('…and the model has the SEO field', def2b?.fields?.some(f => f.key === 'seo' && f.kind === 'seo'), JSON.stringify(def2b?.fields?.map(f => f.key)));

/* ------------------- Site setup → SEO: Default SEO is the editor (SB-33) */
const site3 = (await call('POST', '/tenant/api/projects', { name: `Defaults ${stamp}`, type: 'website' }, T)).body;
const P3 = path => `/tenant/api/p/${site3._id}${path}`;
const SB3 = path => `/tenant/api/p/${site3._id}/site-builder${path}`;
await call('GET', SB3('/design'), null, T);
const defaults = {
	ogTitle: 'Akashbari Global — study abroad',
	ogDescription: 'Counselling, applications and visas.',
	ogType: 'website',
	ogImageAlt: 'Our Dhaka office',
	twitterCard: 'summary',
	twitterTitle: 'Akashbari on X',
	robots: { index: true, follow: true, noArchive: true, maxSnippet: 150, maxImagePreview: 'standard' },
	schemaType: 'LocalBusiness',
	schemaJson: '{ "areaServed": "BD" }',
	sitemap: { include: true, priority: 0.5, changeFrequency: 'monthly' },
};
r = await call('PUT', P3('/site-config'), { seo: { metaTitle: 'Akashbari Global', metaDescription: 'Study abroad from Bangladesh: counselling, university applications and visa support.', ogImage: 'https://cdn.example.com/site.jpg', defaults } }, T);
ok('Default SEO saves the editor’s fields', r.status === 200 && r.body?.seo?.defaults?.ogTitle === defaults.ogTitle && r.body.seo.defaults.robots?.noArchive === true && r.body.seo.metaTitle === 'Akashbari Global', `${r.status} ${JSON.stringify(r.body?.seo || r.body?.message).slice(0, 300)}`);
ok('…kept in the editor’s shape, without the four fields of its own', r.body?.seo?.defaults && !('metaTitle' in r.body.seo.defaults) && r.body.seo.defaults.sitemap?.changeFrequency === 'monthly', JSON.stringify(r.body?.seo?.defaults).slice(0, 300));
r = await call('PUT', P3('/site-config'), { seo: { defaults: { ...defaults, schemaJson: '{nope' } } }, T);
ok('…a bad value is refused', r.status === 400 && /JSON-LD/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);

const pages3 = (await call('GET', SB3('/pages'), null, T)).body.pages;
r = await call('POST', SB3('/pages'), { name: 'Services', path: '/services', seo: { title: 'Services | Akashbari', description: 'What we do for students going abroad.' } }, T);
r = await call('POST', SB3('/publish'), { note: 'defaults' }, T);
ok('(published)', r.status === 200, `${r.status} ${r.body?.message}`);
const live3 = async path => (await call('GET', `/public/api/${site3.publicSlug}/render?path=${encodeURIComponent(path)}`)).body?.page?.seo || {};
const home3 = await live3('/');
ok('home page: the defaults’ copy and settings', home3.ogTitle === defaults.ogTitle && home3.ogImageAlt === defaults.ogImageAlt && home3.twitterCard === 'summary' && home3.schemaType === 'LocalBusiness' && home3.noArchive === true && home3.maxSnippet === 150, JSON.stringify(home3).slice(0, 400));
const svc3 = await live3('/services');
ok('another page: the settings, not the home page’s copy', svc3.twitterCard === 'summary' && svc3.noArchive === true && svc3.maxImagePreview === 'standard' && svc3.ogTitle === '' && svc3.schemaType === 'auto', JSON.stringify(svc3).slice(0, 400));
const key3 = await projectKey(site3.publicSlug);
const xml3 = await (await fetch(`${ROOT}/public/api/site/sitemap.xml?apiKey=${key3}&origin=https://akashbari.test`)).text();
ok('sitemap: a page without its own uses the default priority and frequency', xml3.includes('<loc>https://akashbari.test/services</loc>') && /services<\/loc>[^]*?<changefreq>monthly<\/changefreq><priority>0\.5<\/priority>/.test(xml3), xml3);
ok('(the home page is there)', pages3.some(p => p.isHome));
done();
