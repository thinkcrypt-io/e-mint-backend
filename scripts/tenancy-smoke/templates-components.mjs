// CMS-03b (docs/cms D3) + Template Studio: templates carry the components their models use. A blueprint lists them
// (models.components); validation checks them (address, fields, links to the template's models, a component inside
// another carried and plain, every model's component carried) and dry-runs the models against them; building a
// project makes them before the models; capturing a project brings them along with the fields that use them.
import { call, ok, done } from './lib.mjs';

const A = '/admin/api';
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const uri = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
const db = mc.db();
await db.collection('projecttemplates').deleteMany({ key: /^smoke-comps/ });

let r = await call('POST', `${A}/auth/login`, { email: 'admin@example.com', password: 'tenancy-dev-pass-1' });
const T = r.body.token;
const t = (path, method = 'GET', body) => call(method, `${A}/templates${path}`, body, T);

const button = { category: 'shared', name: 'button', title: 'Button', icon: 'mouse-pointer-click', fields: [{ key: 'label', label: 'Label', kind: 'text', required: true }, { key: 'url', label: 'Link', kind: 'url' }] };
const quote = { category: 'content', name: 'quote', title: 'Quote', fields: [
	{ key: 'text', label: 'Text', kind: 'textarea' },
	{ key: 'author', label: 'Author', kind: 'reference', ref: 'Author' },
	{ key: 'cta', label: 'Button', kind: 'component', component: 'shared.button' },
] };
const blueprint = (components, storyFields) => ({
	overview: { name: 'Smoke comps', summary: 'Stories with quotes.', description: 'x', audience: 'x', category: 'Test' },
	models: {
		steps: [
			{ action: 'create', name: 'Author', title: 'Authors', description: 'People.', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] },
			{ action: 'create', name: 'Story', title: 'Stories', description: 'Stories.', displayField: 'title', fields: storyFields || [
				{ key: 'title', label: 'Title', kind: 'text', required: true },
				{ key: 'quote', label: 'Quote', kind: 'component', component: 'content.quote' },
				{ key: 'buttons', label: 'Buttons', kind: 'component', component: 'shared.button', repeatable: true },
			] },
		],
		components,
	},
	guide: { steps: [{ title: 'Add a story', body: 'x', page: 'Story' }] },
});

/* ---- checks */
r = await t('', 'POST', { type: 'app', key: 'smoke-comps-bad', blueprint: blueprint([quote]) });
let errs = (r.body?.doc?.validation?.errors || []).map(i => i.message).join(' | ');
ok('a component inside another must be carried', /uses “shared.button”, which the template doesn’t carry/.test(errs), errs);
ok('…and so must a model’s', /Buttons uses the component “shared.button”/.test(errs), errs);
r = await t('', 'POST', { type: 'app', key: 'smoke-comps-bad2', blueprint: blueprint([button, { ...quote, fields: [...quote.fields, { key: 'by', label: 'By', kind: 'reference', ref: 'Nobody' }] }]) });
errs = (r.body?.doc?.validation?.errors || []).map(i => i.message).join(' | ');
ok('a link inside one names a model of the template', /links to “Nobody”, which isn’t a model of the template/.test(errs), errs);
r = await t('', 'POST', { type: 'app', key: 'smoke-comps-bad3', blueprint: blueprint([button, quote, { category: 'content', name: 'deep', title: 'Deep', fields: [{ key: 'q', label: 'Q', kind: 'component', component: 'content.quote' }] }]) });
errs = (r.body?.doc?.validation?.errors || []).map(i => i.message).join(' | ');
ok('only a plain component goes inside another', /only a component of plain fields/.test(errs), errs);

r = await t('', 'POST', { type: 'app', key: 'smoke-comps', blueprint: blueprint([button, quote]) });
const tpl = r.body?.doc;
ok('a template with components checks clean', tpl?.validation?.ok, JSON.stringify(tpl?.validation?.errors?.map(i => i.message)));
ok('…what’s inside lists them', tpl?.whatsInside?.components?.map(c => c.uid).join() === 'shared.button,content.quote', JSON.stringify(tpl?.whatsInside?.components));
const dry = await db.collection('componentdefinitions').countDocuments({ project: new ObjectId('00000000000000000000d0a2') });
ok('the dry run leaves nothing behind', dry === 0, dry);

/* ---- built */
r = await t(`/${tpl._id}/preview`, 'POST', {});
const pv = r.body?.project?._id;
ok('a project built from it', r.status === 201 && pv, `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.problems || '')}`);
const comps = await db.collection('componentdefinitions').find({ project: new ObjectId(pv) }).toArray();
ok('…has its components', comps.map(c => c.uid).sort().join() === 'content.quote,shared.button', comps.map(c => c.uid).join());
const story = await db.collection('modeldefinitions').findOne({ project: new ObjectId(pv), name: 'Story' });
ok('…and its models use them', story?.fields?.find(f => f.key === 'quote')?.component === 'content.quote' && story.fields.find(f => f.key === 'buttons')?.repeatable === true, JSON.stringify(story?.fields));

/* ---- captured */
r = await t('/capture', 'POST', { project: pv, name: 'Smoke comps captured' });
const cap = r.body?.doc;
ok('capturing it brings the components along', r.status === 201 && cap?.draft?.models?.components?.map(c => `${c.category}.${c.name}`).sort().join() === 'content.quote,shared.button', `${r.status} ${r.body?.message} ${JSON.stringify(cap?.draft?.models?.components)}`);
const capStory = cap?.draft?.models?.steps?.find(s => s.name === 'Story');
ok('…and the fields that use them', capStory?.fields?.find(f => f.key === 'quote')?.component === 'content.quote' && capStory.fields.find(f => f.key === 'buttons')?.repeatable === true, JSON.stringify(capStory?.fields));
ok('…the link inside one kept', cap?.draft?.models?.components?.find(c => c.name === 'quote')?.fields?.find(f => f.key === 'author')?.ref === 'Author', JSON.stringify(cap?.draft?.models?.components));
ok('the captured template checks clean', cap?.validation?.ok, JSON.stringify(cap?.validation?.errors?.map(i => i.message)));

await t(`/previews/${pv}`, 'DELETE');
await db.collection('projecttemplates').deleteMany({ key: /^smoke-comps/ });
await mc.close();
done();
