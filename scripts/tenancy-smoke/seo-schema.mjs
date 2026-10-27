// docs/seo SEO-04: the structured data forms. A page's SEO keeps the form's values as `schemaData`; the render
// answer turns them into `seo.schemaProps` (the schema.org properties mint-sites merges into the page's JSON-LD),
// /site/head merges them into its jsonLd, a template page's values may be {{record.…}} bindings, and the builder
// app's saves (which don't send schemaData) keep them. Each type's properties are unit-tested in
// library/siteBuilder/test/schema.test.ts. Stands alone.
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sky Schema', email: `sky${stamp}@example.com`, password: 'tenant-pass-123', organization: `Sky ${stamp}`, country: 'BD' });
const T = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Schema Shoes', type: 'website', domains: ['www.schema-shoes.invalid'] }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const SB = path => P(`/site-builder${path}`);
const render = path => call('GET', `/public/api/${site.publicSlug}/render?path=${encodeURIComponent(path)}`);

r = await call('POST', P('/builder/api-keys'), { name: 'Claude publishes', scopes: ['read', 'build', 'publish'] }, T);
const mcpKey = r.body?.secret;
const tool = async (name, args = {}) => {
	const x = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${mcpKey}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
	return (await x.json().catch(() => null))?.result;
};
const text = res => res?.content?.[0]?.text || '';

await call('PUT', P('/site-config'), { identity: { siteName: 'Schema Shoes', logo: 'https://img.invalid/logo.png' } }, T);

/* ---- a shoes model for a template page ---- */
let res = await tool('build_feature', {
	feature: {
		title: 'Shoes',
		summary: 'The catalogue.',
		sidebarCategory: 'Website',
		steps: [
			{
				action: 'create', name: 'Shoe', title: 'Shoes', rationale: 'The catalogue.', displayField: 'name', publicApi: { enabled: true, actions: ['list', 'get'] },
				fields: [
					{ key: 'name', label: 'Name', kind: 'text', required: true },
					{ key: 'slug', label: 'Slug', kind: 'text' },
					{ key: 'price', label: 'Price', kind: 'number' },
					{ key: 'maker', label: 'Maker', kind: 'text' },
					{ key: 'photo', label: 'Photo', kind: 'image' },
				],
			},
		],
	},
});
ok('a Shoes model with a public API', !res?.isError, text(res).slice(0, 160));
res = await tool('create_records', { route: 'shoes', records: [{ name: 'Oxford', slug: 'oxford', price: 4500, maker: 'Apex', photo: 'https://img.invalid/oxford.jpg' }] });
ok('a shoe', !res?.isError, text(res).slice(0, 160));

/* ---- pages: home as a LocalBusiness, a FAQ, the shoe template as a Product ---- */
const business = {
	businessType: 'ShoeStore',
	telephone: '+880 1700 000000',
	street: 'House 12, Road 4',
	city: 'Dhaka',
	country: 'BD',
	sameAs: 'https://facebook.com/schemashoes',
	hours: [{ days: ['mo', 'tu', 'we', 'th', 'fr'], opens: '09:00', closes: '18:00' }],
};
res = await tool('save_site_page', { path: '/', name: 'Home', tree: [{ type: 'heading', props: { text: 'Schema Shoes', level: 1 } }], seo: { title: 'Schema Shoes — hand-made in Dhaka', schemaType: 'LocalBusiness', schemaData: business } });
ok('home: a LocalBusiness form over MCP', !res?.isError, text(res).slice(0, 200));
res = await tool('save_site_page', {
	path: '/faq',
	name: 'FAQ',
	tree: [{ type: 'heading', props: { text: 'Questions', level: 1 } }],
	seo: { title: 'Questions about our shoes', schemaType: 'FAQPage', schemaData: { faqs: [{ question: 'Do you deliver?', answer: 'Across Bangladesh.' }, { question: 'Half a pair' }] }, schemaJson: '{ "inLanguage": "en" }' },
});
ok('a FAQ page', !res?.isError, text(res).slice(0, 200));
res = await tool('save_site_page', {
	path: '/shoes/[slug]',
	name: 'Shoe',
	kind: 'template',
	source: { model: 'shoes', match: { param: 'slug', field: 'slug' } },
	tree: [{ type: 'heading', props: { text: '{{record.name}}', level: 1 } }],
	seo: { title: '{{record.name}}', schemaType: 'Product', schemaData: { brand: '{{record.maker}}', price: '{{record.price}}', currency: 'bdt', availability: 'InStock' } },
});
ok('a template page with bound Product fields', !res?.isError, text(res).slice(0, 200));
res = await tool('save_site_page', { path: '/bad', name: 'Bad', tree: [], seo: { schemaData: ['not', 'an', 'object'] } });
ok('a form that isn’t one object: refused', res?.isError && /one object/.test(text(res)), text(res).slice(0, 200));
res = await tool('publish_site', { note: 'SEO-04' });
ok('published', !res?.isError && /Published/.test(text(res)), text(res).slice(0, 200));

/* ---- the render answer ---- */
r = await render('/');
let sp = r.body?.page?.seo?.schemaProps || {};
ok('home: the business as its kind, with the site’s name and logo', sp['@type'] === 'ShoeStore' && sp.name === 'Schema Shoes' && sp.logo === 'https://img.invalid/logo.png', JSON.stringify(sp).slice(0, 300));
ok('…address, phone, socials', sp.address?.streetAddress === 'House 12, Road 4' && sp.address.addressLocality === 'Dhaka' && sp.telephone === '+880 1700 000000' && sp.sameAs?.[0] === 'https://facebook.com/schemashoes', JSON.stringify(sp).slice(0, 300));
ok('…opening hours', sp.openingHoursSpecification?.[0]?.dayOfWeek?.length === 5 && sp.openingHoursSpecification[0].opens === '09:00', JSON.stringify(sp.openingHoursSpecification));
r = await render('/faq');
sp = r.body?.page?.seo?.schemaProps || {};
ok('FAQ: the complete pair only', sp.mainEntity?.length === 1 && sp.mainEntity[0].acceptedAnswer.text === 'Across Bangladesh.', JSON.stringify(sp));
ok('…the custom JSON-LD still sent beside it', /inLanguage/.test(r.body?.page?.seo?.schemaJson || ''), r.body?.page?.seo?.schemaJson);
r = await render('/shoes/oxford');
sp = r.body?.page?.seo?.schemaProps || {};
ok('template: the record’s maker and price fill the Product', sp.brand?.name === 'Apex' && sp.offers?.price === 4500 && sp.offers.priceCurrency === 'BDT' && sp.offers.availability === 'https://schema.org/InStock', JSON.stringify(sp));

/* ---- the panel: the template page's record fields, for the { } menu ---- */
r = await call('GET', SB('/pages'), null, T);
const pages = r.body?.pages || [];
r = await call('GET', P(`/site-config/seo-page?path=${encodeURIComponent('/shoes/[slug]')}`), null, T);
ok('seo-page: a template page names its model’s fields', r.body?.record?.model === 'shoes' && ['name', 'price', 'maker'].every(k => r.body.record.fields.some(f => f.key === k)), JSON.stringify(r.body).slice(0, 300));

/* ---- the builder app saves without schemaData: the form's values stay ---- */
const home = pages.find(p => p.isHome);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
const draftSeo = { ...r.body.draft.seo };
delete draftSeo.schemaData;
r = await call('PUT', SB(`/pages/${home.id}`), { rev: r.body.draft.rev, seo: { ...draftSeo, title: 'Schema Shoes — shoes made by hand' } }, T);
ok('a builder save without the form', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
ok('…keeps it', r.body?.draft?.seo?.schemaData?.businessType === 'ShoeStore' && r.body.draft.seo.title.endsWith('by hand'), JSON.stringify(r.body?.draft?.seo?.schemaData));

/* ---- the page's SEO record (the panel's editor) carries it too ---- */
r = await call('GET', P('/seo'), null, T);
const homeRec = (r.body?.doc || []).find(d => d.seo?.schemaType === 'LocalBusiness');
ok('the SEO record has the form’s values', homeRec?.seo?.schemaData?.city === 'Dhaka', JSON.stringify(homeRec?.seo).slice(0, 300));
r = await call('PUT', P(`/seo/${homeRec?._id}`), { seo: { ...homeRec.seo, schemaData: { ...homeRec.seo.schemaData, priceRange: '৳৳' } } }, T);
ok('…edited in the panel', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
ok('…reaches the page', r.body?.draft?.seo?.schemaData?.priceRange === '৳৳', JSON.stringify(r.body?.draft?.seo?.schemaData));

/* ---- a site built elsewhere: /site/head ---- */
r = await call('POST', P('/pages'), { name: 'Repairs', path: '/repairs', status: 'published' }, T);
const repairs = r.body?.doc || r.body;
r = await call('POST', P('/seo'), { page: repairs?._id, seo: { metaTitle: 'Shoe repairs', schemaType: 'Service', schemaData: { serviceType: 'Shoe repair', areaServed: 'Dhaka', price: '300', currency: 'BDT' } } }, T);
ok('a connected-site page with a Service form', [200, 201].includes(r.status), `${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
const KEY = await projectKey(site.publicSlug);
const head = await (await fetch(`${ROOT}/public/api/site/head?apiKey=${KEY}&path=/repairs`)).json();
const svc = (head?.jsonLd || []).find(b => b['@type'] === 'Service');
ok('/site/head: the Service with its provider and offer', svc?.serviceType === 'Shoe repair' && svc.provider?.name === 'Schema Shoes' && svc.offers?.price === 300 && svc.name === 'Shoe repairs', JSON.stringify(head?.jsonLd).slice(0, 400));

/* ---- Site setup → Default SEO keeps its form too (the home page falls back to it) ---- */
r = await call('PUT', P('/site-config'), { seo: { defaults: { schemaType: 'Organization', schemaData: { sameAs: ['https://x.com/schemashoes'] } } } }, T);
ok('Default SEO with an Organization form', r.status === 200 && r.body?.seo?.defaults?.schemaData?.sameAs?.[0] === 'https://x.com/schemashoes', `${r.status} ${JSON.stringify(r.body?.seo?.defaults || r.body?.message).slice(0, 200)}`);

done();
