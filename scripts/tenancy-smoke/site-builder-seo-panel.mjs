// The panel's SEO records edited with the SEO editor (docs/site-builder SB-32):
// the kit's SEO model has an `seo` field (kind seo, the AGS VSeo object) beside
// its six plain fields. A panel save of the object fills the plain fields and
// reaches the page's SEO in full (social, indexing, structured data, sitemap);
// a builder save fills the object; a plain-field save through the API keeps the
// object in step; and a project made before SB-32 is upgraded when its site opens.
import { call, ok, done } from './lib.mjs';

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
done();
