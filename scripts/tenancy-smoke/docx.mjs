// Download document (docs/rich-text RT-13, RT-14): POST /<route>/export/docx
// and /export/richtext — one record's rich-text field as Word, PDF, Markdown
// or plain text, from the row menu, the field's panel or the full-page
// editor. The files (a real .docx and PDF, the words in each, nothing
// unsafe), the checks (a rich-text field only, empty, unknown record, a
// known format), who may download (the page's read permission and the
// project, like PDF downloads), and the editor's save: one field only.
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
const docx = async (body, who = alma, route = 'posts', path = 'export/docx') => {
	const res = await fetch(ROOT + P(blog._id, `/${route}/${path}`), {
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

/* ---- the other formats (/export/richtext) */
const rich = (format, body = { id: post, field: 'body' }) => docx({ ...body, ...(format && { format }) }, alma, 'posts', 'export/richtext');
r = await rich();
ok('no format: a Word file', r.status === 200 && r.buf.subarray(0, 2).toString() === 'PK' && /\.docx/.test(r.disposition), r.json?.message || r.disposition);
r = await rich('pdf');
ok('PDF downloads', r.status === 200 && r.type.startsWith('application/pdf') && r.buf.subarray(0, 5).toString() === '%PDF-', r.json?.message || r.type);
ok('the PDF is named after the record and the field', /My%20first%20post%20%E2%80%94%20Body\.pdf/.test(r.disposition), r.disposition);
ok('the PDF links out', r.buf.toString('latin1').includes('https://example.com/x'));
r = await rich('md');
const md = r.buf.toString('utf8');
ok('Markdown downloads', r.status === 200 && r.type.startsWith('text/markdown') && /\.md/.test(r.disposition), r.json?.message || r.type);
ok('Markdown has the heading, marks, link, lists, quote and code', ['## Hello Word', '**bold**', '*italic*', '[a link](https://example.com/x)', '- Bullet one', '  - Nested bullet', '1. Step one', '> Quoted words', '```\nnpm test\n```', 'Tail & end'].every(w => md.includes(w)), md);
ok('nothing of the script in the Markdown', !/alert|onerror|script/i.test(md));
r = await rich('txt');
const txt = r.buf.toString('utf8');
ok('plain text downloads', r.status === 200 && r.type.startsWith('text/plain') && /\.txt/.test(r.disposition), r.json?.message || r.type);
ok('plain text has the words, bullets and the link’s address', ['Hello Word', 'Centred bold and italic', 'a link (https://example.com/x)', '• Bullet one', '◦ Nested bullet', '1. Step one'].every(w => txt.includes(w)) && !/[<>*#]/.test(txt), txt);
r = await rich('rtf');
ok('an unknown format is refused', r.status === 400 && /docx, pdf, md or txt/.test(r.json?.message), r.json?.message);
r = await rich('pdf', { id: post, field: 'summary' });
ok('an empty field says so in any format', r.status === 400 && /is empty/.test(r.json?.message), r.json?.message);

/* ---- tables and paper (RT-15) */
const tablePost = await add({
	title: 'Prices',
	body: '<p>Plans</p><table style="border:1px solid #000"><tbody><tr><td data-row="r1">Plan</td><td data-row="r1" class="ql-align-right">Price | note</td></tr><tr><td data-row="r2" onclick="x()">Starter</td><td data-row="r2">$9</td></tr></tbody></table>',
});
r = await rich('md', { id: tablePost, field: 'body' });
ok('a table comes through in Markdown', /\| Plan \| Price \\\| note \|\n\| --- \| ---: \|\n\| Starter \| \$9 \|/.test(r.buf.toString('utf8')), r.buf.toString('utf8'));
r = await rich('txt', { id: tablePost, field: 'body' });
ok('…and lined up in plain text', /Plan {6}Price \| note\nStarter {3}\$9/.test(r.buf.toString('utf8')), JSON.stringify(r.buf.toString('utf8')));
r = await docx({ id: tablePost, field: 'body', pageSize: 'letter' });
const tableXml = r.status === 200 ? unzip(r.buf, 'word/document.xml') : '';
ok('a Word table, on Letter paper when asked', /<w:tbl>/.test(tableXml) && /<w:pgSz w:w="12240" w:h="15840"/.test(tableXml) && !/onclick/.test(tableXml), r.json?.message || tableXml.slice(0, 120));
r = await docx({ id: tablePost, field: 'body' });
ok('A4 when no paper is named', /<w:pgSz w:w="11906" w:h="16838"/.test(unzip(r.buf, 'word/document.xml')));
r = await rich('pdf', { id: tablePost, field: 'body', pageSize: 'a5' });
ok('a PDF on A5', r.status === 200 && /\/MediaBox \[0 0 419\.53/.test(r.buf.toString('latin1')), r.json?.message || r.buf.toString('latin1').match(/MediaBox[^\]]*\]/)?.[0]);

/* ---- the full-page editor saves one field */
r = await call('PUT', P(blog._id, `/posts/${post}`), { body: '<p>Rewritten</p>' }, alma);
ok('saving the body alone', r.status === 200, r.body?.message);
r = await call('GET', P(blog._id, `/posts/${post}`), null, alma);
const saved = r.body?.doc || r.body;
ok('…changes the body and nothing else', saved?.body === '<p>Rewritten</p>' && saved?.title === 'My first post' && saved?.note === 'plain' && saved?.summary === '<p><br></p>', JSON.stringify(saved).slice(0, 200));
r = await rich('md');
ok('and the download is the saved words', r.buf.toString('utf8') === 'Rewritten\n', JSON.stringify(r.buf.toString('utf8')));

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
r = await docx({ id: post, field: 'body', format: 'pdf' }, ivy, 'posts', 'export/richtext');
ok('…in any format', r.status === 403 || r.status === 401, `${r.status} ${r.json?.message}`);
r = await call('PUT', P(blog._id, `/posts/${post}`), { body: '<p>Hers</p>' }, ivy);
ok('…nor save the body from the editor', r.status === 403 || r.status === 401, `${r.status} ${r.body?.message}`);

await call('DELETE', `/tenant/api/projects/${blog._id}?force=1`, null, alma);
await mongoose.disconnect();
done();
