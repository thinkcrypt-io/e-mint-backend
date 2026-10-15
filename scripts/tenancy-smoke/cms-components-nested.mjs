// CMS-03b (docs/cms D3): components inside components and links inside components. A component may hold another
// whose fields are all plain (once or as a list), and links to the project's records; records save and read them with
// the linked names filled in; the form gets a record picker; a change to the inner one reaches the models using the
// outer one; neither can be deleted while used; depth stays at one level.
// Uses projects.mjs's state (pat); makes its own project.
import { call, ok, done, load } from './lib.mjs';
const s = load();
const stamp = Date.now();

let r = await call('POST', '/tenant/api/projects', { name: `CMS nested ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
ok('project made', !!pid, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;
const B = path => P(`/builder${path}`);

/* ---- a model to link to */
r = await call('POST', B('/models'), { name: 'Author', title: 'Authors', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, s.pat);
const authors = r.body?.doc;
ok('an Authors model', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
const ana = (await call('POST', P(`/${authors.route}`), { name: 'Ana' }, s.pat)).body?.doc;
const bo = (await call('POST', P(`/${authors.route}`), { name: 'Bo' }, s.pat)).body?.doc;
ok('two authors', ana?._id && bo?._id, '');

/* ---- components */
r = await call('POST', B('/components'), { category: 'shared', name: 'button', title: 'Button', fields: [
	{ key: 'label', label: 'Label', kind: 'text', required: true },
	{ key: 'url', label: 'Link', kind: 'url' },
] }, s.pat);
const button = r.body;
ok('a plain Button', r.status === 201, JSON.stringify(r.body));
r = await call('POST', B('/components'), { category: 'content', name: 'quote', title: 'Quote', fields: [
	{ key: 'text', label: 'Text', kind: 'textarea' },
	{ key: 'author', label: 'Author', kind: 'reference', ref: authors.name },
	{ key: 'also', label: 'Also by', kind: 'references', ref: authors.name },
	{ key: 'cta', label: 'Button', kind: 'component', component: 'shared.button' },
	{ key: 'more', label: 'More buttons', kind: 'component', component: 'shared.button', repeatable: true },
] }, s.pat);
const quote = r.body;
ok('a Quote with links and a Button inside', r.status === 201 && quote?.fields?.length === 5, JSON.stringify(r.body));

r = await call('POST', B('/components'), { category: 'content', name: 'deep', title: 'Deep', fields: [{ key: 'q', label: 'Quote', kind: 'component', component: 'content.quote' }] }, s.pat);
ok('only a plain component goes inside another', r.status === 400 && /only a component of plain fields/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
r = await call('PUT', B(`/components/${quote._id}`), { title: 'Quote', fields: [...quote.fields, { key: 'self', label: 'Self', kind: 'component', component: 'content.quote' }] }, s.pat);
ok('a component can’t hold itself', r.status === 400 && /can't hold itself/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
r = await call('PUT', B(`/components/${button._id}`), { title: 'Button', fields: [...button.fields, { key: 'extra', label: 'Extra', kind: 'section', fields: [{ key: 'a', label: 'A', kind: 'text' }] }] }, s.pat);
ok('one inside another stays plain', r.status === 400 && /inside Quote/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
r = await call('POST', B('/components'), { category: 'shared', name: 'odd', title: 'Odd', fields: [{ key: 'x', label: 'X', kind: 'reference', ref: 'NoSuchModel' }] }, s.pat);
ok('a link names a model of the project', r.status === 400, JSON.stringify(r.body));

/* ---- a model using it */
r = await call('POST', B('/models'), { name: 'Story', title: 'Stories', fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'quote', label: 'Quote', kind: 'component', component: 'content.quote' },
	{ key: 'quotes', label: 'Quotes', kind: 'component', component: 'content.quote', repeatable: true },
] }, s.pat);
const story = r.body?.doc;
ok('a Stories model using it', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
const route = story.route;
r = await call('POST', P(`/${route}`), {
	title: 'First',
	quote: { text: 'Bread is life', author: ana._id, also: [bo._id], cta: { label: 'Read', url: '/read' }, more: [{ label: 'One' }, { label: 'Two' }] },
	quotes: [{ text: 'Second', author: bo._id }],
}, s.pat);
const rec = r.body?.doc;
ok('a record with a component inside a component, and links', r.status === 201 && rec?.quote?.cta?.label === 'Read' && rec.quote.more.length === 2 && String(rec.quote.author) === ana._id, `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
r = await call('POST', P(`/${route}`), { title: 'Bad', quote: { cta: { url: '/x' } } }, s.pat);
ok('the inner component’s required field is checked', r.status === 400 && /Label/.test(r.body?.message), `${r.status} ${r.body?.message}`);

r = await call('GET', P(`/${route}/${rec._id}`), null, s.pat);
const one = r.body;
ok('reading it names the linked records', one?.quote?.author?.name === 'Ana' && one.quote.also?.[0]?.name === 'Bo' && one.quotes?.[0]?.author?.name === 'Bo', JSON.stringify(one?.quote).slice(0, 300));
r = await call('GET', P(`/${route}?limit=5`), null, s.pat);
ok('…in the list too', r.body?.doc?.[0]?.quote?.author?.name === 'Ana', JSON.stringify(r.body?.doc?.[0]?.quote).slice(0, 200));

r = await call('GET', P(`/${route}/get/form`), null, s.pat);
const form = JSON.stringify(r.body);
r = await call('GET', P(`/${route}/get/schema`), null, s.pat);
const schema = r.body;
const dm = (schema?.quote?.dataModel || schema?.quote?.schema?.dataModel || []);
const picker = dm.find(x => x.name === 'author');
const inner = dm.find(x => x.name === 'cta');
ok('the form gets a record picker inside the group', picker?.type === 'data-menu' && picker.model === authors.route && picker.labelKey === 'name', JSON.stringify(picker) + ' ' + form.slice(0, 100));
ok('…and the inner component as a group of its own', inner?.type === 'section-object' && inner.dataModel?.some(x => x.name === 'label'), JSON.stringify(inner));

/* ---- a change to the inner one reaches the models using the outer one */
r = await call('PUT', B(`/components/${button._id}`), { title: 'Button', fields: [...button.fields, { key: 'newTab', label: 'New tab', kind: 'boolean' }] }, s.pat);
ok('the inner component changed', r.status === 200 && r.body?.refreshed?.some(m => m.route === route), JSON.stringify(r.body?.refreshed));
r = await call('PUT', P(`/${route}/${rec._id}`), { quote: { ...one.quote, author: ana._id, also: [bo._id], cta: { label: 'Read', url: '/read', newTab: true } } }, s.pat);
r = await call('GET', P(`/${route}/${rec._id}`), null, s.pat);
ok('…and Stories take its new field', r.body?.quote?.cta?.newTab === true, JSON.stringify(r.body?.quote?.cta));

/* ---- in use */
r = await call('GET', B('/components'), null, s.pat);
const listed = (r.body?.doc || []).find(c => c.uid === 'shared.button');
ok('the inner one lists the component using it', listed?.usedBy?.some(u => u.component === 'content.quote'), JSON.stringify(listed?.usedBy));
r = await call('DELETE', B(`/components/${button._id}`), null, s.pat);
ok('…and can’t be deleted while it’s there', r.status === 400 && /Quote \(a component\)/.test(r.body?.message), r.body?.message);
done();
