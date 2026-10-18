// Download DOCX (docs/rich-text): POST /<route>/export/docx — one record's
// rich-text field as a Word file, from the row menu or the field's panel.
// The file (a real .docx, the text and lists in it, nothing unsafe), the
// checks (a rich-text field only, empty, unknown record), and who may
// download: the page's read permission and the project, like PDF downloads.
// Stands alone (its own accounts). Local scratch server only.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import mongoose from 'mongoose';
import { ROOT, call, ok, done } from './lib.mjs';
const stamp = Date.now();
const PASS = 'docx-pass-123';
const P = (pid, p) => `/tenant/api/p/${pid}${p}`;
const MONGO = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
await mongoose.connect(MONGO);
const email = key => `${key}${stamp}@example.com`;
const register = async (name, key) =>
	(await call('POST', '/tenant/api/auth/register', { name, email: email(key), password: PASS, organization: `${name} Co ${stamp}`, country: 'BD' })).body.token;

const alma = await register('Alma', 'alma');
let ivy = await register('Ivy', 'ivy');
const bob = await register('Bob', 'bob');
await mongoose.connection.db.collection('tenantusers').updateMany({ email: email('ivy') }, { $set: { emailVerified: true } });
const blog = (await call('POST', '/tenant/api/projects', { name: 'Blog', type: 'app' }, alma)).body;

let r = await call('POST', P(blog._id, '/builder/models'), {
	name: 'Post', title: 'Posts',
	fields: [
		{ key: 'title', label: 'Title', kind: 'text', required: true },
		{ key: 'body', label: 'Body', kind: 'editor' },
		{ key: 'summary', label: 'Summary', kind: 'editor' },
		{ key: 'note', label: 'Note', kind: 'text' },
	],
}, alma);
ok('Posts made (rich-text body and summary)', r.status === 201, r.body?.message);
r = await call('POST', P(blog._id, '/builder/models'), { name: 'Tag', title: 'Tags', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, alma);
ok('Tags made', r.status === 201, r.body?.message);

const ui = '<span class="ql-ui" contenteditable="false"></span>';
const BODY =
	'<h1>Hello Word</h1><p class="ql-align-center">Centred <strong>bold</strong> and <em>italic</em> with <a href="https://example.com/x">a link</a>.</p>' +
	`<ol><li data-list="bullet">${ui}Bullet one</li><li data-list="bullet" class="ql-indent-1">${ui}Nested bullet</li><li data-list="ordered">${ui}Step one</li></ol>` +
	'<blockquote>Quoted words</blockquote><pre>npm test</pre><img src="x" onerror="alert(1)"><script>alert(2)</script><p>Tail &amp; end</p>';
const add = async body => { const b = (await call('POST', P(blog._id, '/posts'), body, alma)).body; return b?._id || b?.doc?._id; };
const post = await add({ title: 'My first post', body: BODY, summary: '<p><br></p>', note: 'plain' });
ok('a post made', !!post);

/** POST export/docx with the raw response — the file, or the JSON error. */
const docx = async (body, who = alma, route = 'posts') => {
	const res = await fetch(ROOT + P(blog._id, `/${route}/export/docx`), {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: who },
		body: JSON.stringify(body),
	});
	const buf = Buffer.from(await res.arrayBuffer());
	let json = null;
	if (!res.ok) try { json = JSON.parse(buf.toString('utf8')); } catch {}
	return { status: res.status, type: res.headers.get('content-type') || '', disposition: res.headers.get('content-disposition') || '', buf, json };
};
const unzip = (buf, member) => {
	const file = path.join(os.tmpdir(), `smoke-docx-${stamp}.docx`);
	fs.writeFileSync(file, buf);
	try { return execFileSync('unzip', ['-p', file, member]).toString('utf8'); } finally { fs.rmSync(file, { force: true }); }
};

/* ---- the file */
r = await docx({ id: post, field: 'body' });
ok('Body downloads', r.status === 200, r.json?.message || r.status);
ok('as a Word file', r.type.startsWith('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), r.type);
ok('named after the record and the field', /filename\*=UTF-8''My%20first%20post%20%E2%80%94%20Body\.docx/.test(r.disposition), r.disposition);
ok('a zip (.docx)', r.buf.subarray(0, 2).toString() === 'PK');
const xml = r.status === 200 ? unzip(r.buf, 'word/document.xml') : '';
const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
ok('the words are in it', ['Hello Word', 'Centred', 'bold', 'a link', 'Bullet one', 'Nested bullet', 'Step one', 'Quoted words', 'npm test', 'Tail &amp; end'].every(w => text.includes(w)), text.slice(0, 200));
ok('H1 is a heading', /<w:pStyle w:val="Heading1"\/>/.test(xml));
ok('the centred line is centred', /<w:jc w:val="center"\/>/.test(xml));
ok('lists are Word lists, the nested bullet one level in', /<w:numPr><w:ilvl w:val="1"\/>/.test(xml) && /<w:numPr><w:ilvl w:val="0"\/>/.test(xml));
ok('the link is a hyperlink', /<w:hyperlink /.test(xml) && unzip(r.buf, 'word/_rels/document.xml.rels').includes('https://example.com/x'));
ok('nothing of the script or onerror', !/alert|onerror|script/i.test(xml));
const numbering = r.status === 200 ? unzip(r.buf, 'word/numbering.xml') : '';
ok('bullets and numbers defined', /w:val="bullet"/.test(numbering) && /w:val="decimal"/.test(numbering));

/* ---- checks */
r = await docx({ id: post, field: 'note' });
ok('a plain text field is refused', r.status === 400 && /isn’t a rich-text field/.test(r.json?.message), r.json?.message);
r = await docx({ id: post, field: 'nope' });
ok('an unknown field is refused', r.status === 400, r.json?.message);
r = await docx({ id: post, field: 'summary' });
ok('an empty rich-text field says so', r.status === 400 && /is empty/.test(r.json?.message), r.json?.message);
r = await docx({ id: post });
ok('no field: asks for one', r.status === 400, r.json?.message);
r = await docx({ id: 'nope', field: 'body' });
ok('a bad id is refused', r.status === 400, r.json?.message);
r = await docx({ id: new mongoose.Types.ObjectId().toString(), field: 'body' });
ok('a missing record is 404', r.status === 404, r.json?.message);
const tag = (await call('POST', P(blog._id, '/tags'), { name: 'News' }, alma)).body;
r = await docx({ id: tag?._id || tag?.doc?._id, field: 'body' }, alma, 'tags');
ok('another page has no such field', r.status === 400, r.json?.message);

/* ---- who */
r = await docx({ id: post, field: 'body' }, bob);
ok('someone outside the project can’t', r.status === 403 || r.status === 404, `${r.status} ${r.json?.message}`);
r = await call('POST', P(blog._id, '/people/roles'), { name: 'Tags only', permissions: ['view-tags'] }, alma);
const tagsOnly = r.body?._id;
await call('POST', P(blog._id, '/people/invitations'), { email: email('ivy'), role: tagsOnly }, alma);
const inv = (await call('GET', '/tenant/api/invitations/for-me', null, ivy)).body?.doc?.[0];
ivy = (await call('POST', `/tenant/api/invitations/for-me/${inv?._id}/accept`, null, ivy)).body?.token;
ok('Ivy joins with a role that only views Tags', !!ivy);
r = await docx({ id: post, field: 'body' }, ivy);
ok('without Posts’ read permission she can’t', r.status === 403 || r.status === 401, `${r.status} ${r.json?.message}`);

await call('DELETE', `/tenant/api/projects/${blog._id}?force=1`, null, alma);
await mongoose.disconnect();
done();
