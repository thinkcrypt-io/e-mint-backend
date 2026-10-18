// Date formulas (docs/date-formulas): the Date formula field and dates in
// Linked Relationships rules, end to end on a membership — Plans with a length
// in days or months, Members with an expiry, Renewals that move it on from
// the later of the old expiry and today.
// Builder checks (a number where a date is wanted, a bad unit, a date in a
// number formula), a date formula worked out on every save, one worked out
// once (kept when what it reads changes, filled in for older records when
// the field is published), daysBetween in a number formula, a rule's Copy
// from and Work out reading through this record's link (plan.price), a rule
// setting a date, deleting the renewal putting the old date back.
// Stands alone (its own account). Local scratch server only.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const DAY = 86_400_000;
const tok = (await call('POST', '/tenant/api/auth/register', { name: 'Dana', email: `dana${stamp}@example.com`, password: 'date-pass-123', organization: `Dana Gym ${stamp}`, country: 'BD' }))
	.body.token;
const pid = (await call('POST', '/tenant/api/projects', { name: 'Gym', type: 'app' }, tok)).body?._id;
const P = p => `/tenant/api/p/${pid}${p}`;
const make = body => call('POST', P('/builder/models'), body, tok);
const get = async (route, id) => (await call('GET', P(`/${route}/${id}`), null, tok)).body;
const iso = v => (v ? new Date(v).toISOString() : null);
const near = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 120_000;

let r = await make({ name: 'Plan', title: 'Plans', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'price', label: 'Price', kind: 'number' },
	{ key: 'length', label: 'Length', kind: 'number' },
	{ key: 'unit', label: 'Unit', kind: 'select', options: [{ value: 'days' }, { value: 'months' }] },
] });
const plan = r.body?.doc;
ok('a Plan model', r.status === 201, r.body?.problems);

r = await call('GET', P('/builder/models/options'), null, tok);
const pt = (r.body?.targets || []).find(x => x.name === 'Plan');
ok('link targets list numbers (and dates, flagged)', pt?.numbers?.some(n => n.key === 'length' && !n.date), JSON.stringify(pt?.numbers));

const memberFields = (formula, extra = []) => [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'plan', label: 'Plan', kind: 'reference', ref: 'Plan' },
	{ key: 'joinedAt', label: 'Joined', kind: 'date' },
	{ key: 'fee', label: 'Fee', kind: 'number' },
	{ key: 'expiresAt', label: 'Expires at', kind: 'date' },
	{ key: 'firstDue', label: 'First payment due', kind: 'dateformula', formula },
	...extra,
];
r = await make({ name: 'Member', title: 'Members', displayField: 'name', fields: memberFields('joinedAt + 7') });
ok('builder: a date moved with + is refused', r.status === 400 && /addDays/.test(JSON.stringify(r.body?.problems)), JSON.stringify(r.body?.problems));
r = await make({ name: 'Member', title: 'Members', displayField: 'name', fields: memberFields('fee') });
ok('builder: a number is not a date', r.status === 400 && /works out a date/.test(JSON.stringify(r.body?.problems)), JSON.stringify(r.body?.problems));
r = await make({ name: 'Member', title: 'Members', displayField: 'name', fields: memberFields('add(joinedAt, 1, "fortnights")') });
ok('builder: an unknown unit is refused', r.status === 400 && /fortnights/.test(JSON.stringify(r.body?.problems)), JSON.stringify(r.body?.problems));
r = await make({ name: 'Member', title: 'Members', displayField: 'name', fields: memberFields('addDays(joinedAt, 7)', [{ key: 'left', label: 'Days left', kind: 'formula', formula: 'addDays(joinedAt, 7)' }]) });
ok('builder: a date in a number formula is refused', r.status === 400 && /Formula \(date\)/.test(JSON.stringify(r.body?.problems)), JSON.stringify(r.body?.problems));
r = await make({
	name: 'Member',
	title: 'Members',
	displayField: 'name',
	fields: memberFields('addDays(joinedAt, 7)', [
		{ key: 'daysLeft', label: 'Days left', kind: 'formula', formula: 'daysBetween(joinedAt, expiresAt)' },
		{ key: 'renewBy', label: 'Renew by', kind: 'dateformula', formula: 'if(plan.unit = "months", addMonths(joinedAt, plan.length), addDays(joinedAt, plan.length))' },
	]),
});
const member = r.body?.doc;
ok('a Member model with date formulas', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
ok('…its date formula keeps its kind and formula', member?.fields?.find(f => f.key === 'firstDue')?.kind === 'dateformula' && member.fields.find(f => f.key === 'firstDue').formula === 'addDays(joinedAt, 7)');

r = await call('GET', P(`/builder/route?route=${member?.route}`), null, tok);
const settingsOf = b => (b?.settings?.data || b?.code?.settings)?.fields || [];
const fd = settingsOf(r.body).find(f => f.key === 'firstDue');
ok('settings: read-only, a date, a type of its own (Formula (date))', fd?.edit === false && fd?.type === 'date' && fd?.schema?.type === 'dateformula' && !fd?.schema?.returns && fd?.schema?.viewType === 'date', JSON.stringify(fd));

const monthly = (await call('POST', P(`/${plan.route}`), { name: 'Monthly', price: 30, length: 1, unit: 'months' }, tok)).body?.doc;
const days10 = (await call('POST', P(`/${plan.route}`), { name: 'Ten days', price: 12, length: 10, unit: 'days' }, tok)).body?.doc;
r = await call('POST', P(`/${member.route}`), { name: 'Ann', plan: monthly._id, joinedAt: '2026-01-31', expiresAt: '2026-03-02', firstDue: '1999-01-01' }, tok);
const ann = r.body?.doc;
ok('create: worked out, what was sent for it ignored', r.status === 201 && iso(ann?.firstDue) === '2026-02-07T00:00:00.000Z', `${r.status} ${iso(ann?.firstDue)} ${r.body?.message}`);
ok('create: a linked plan’s months — 31 Jan + 1 month is 28 Feb', iso(ann?.renewBy) === '2026-02-28T00:00:00.000Z', iso(ann?.renewBy));
ok('create: daysBetween in a number formula', ann?.daysLeft === 30, ann?.daysLeft);
r = await call('PUT', P(`/${member.route}/${ann._id}`), { plan: days10._id }, tok);
let A = await get(member.route, ann._id);
ok('edit: another plan → worked out again (10 days)', iso(A?.renewBy) === '2026-02-10T00:00:00.000Z', iso(A?.renewBy));
await call('PUT', P(`/${plan.route}/${days10._id}`), { length: 20 }, tok);
A = await get(member.route, ann._id);
ok('the linked plan edited → its members worked out again (20 days)', iso(A?.renewBy) === '2026-02-20T00:00:00.000Z', iso(A?.renewBy));
r = await call('POST', P(`/${member.route}`), { name: 'Bo' }, tok);
ok('no date to start from: empty, not 1970', r.status === 201 && r.body?.doc?.firstDue === null && r.body?.doc?.renewBy === null, JSON.stringify([r.body?.doc?.firstDue, r.body?.doc?.renewBy]));

// Renewals: Renewed until worked out once; a rule moves the member's expiry on.
r = await make({ name: 'Renewal', title: 'Renewals', fields: [
	{ key: 'member', label: 'Member', kind: 'reference', ref: 'Member', required: true },
	{ key: 'plan', label: 'Plan', kind: 'reference', ref: 'Plan', required: true },
	{ key: 'fee', label: 'Fee', kind: 'formula', formula: 'plan.price' },
	{ key: 'until', label: 'Renewed until', kind: 'dateformula', calc: 'once', formula: 'add(latest(member.expiresAt, today()), plan.length, plan.unit)' },
] });
const ren = r.body?.doc;
ok('a Renewal model: a once date formula reading two links', r.status === 201 && ren?.fields?.find(f => f.key === 'until')?.calc === 'once', JSON.stringify(r.body?.problems || r.body?.message));

const publishRules = async rules => {
	const cfg = (await call('GET', P(`/builder/route?route=${ren.route}`), null, tok)).body;
	const draft = { ...(cfg?.config?.data || cfg?.code?.config || {}), linkedRelationships: rules };
	const d = await call('PUT', P('/builder/draft'), { route: ren.route, kind: 'config', draft }, tok);
	if (d.status !== 200) return d;
	return call('POST', P('/builder/publish'), { route: ren.route, kinds: ['config'] }, tok);
};
r = await publishRules([{ id: 'x', target: { via: 'member' }, on: ['create'], set: [{ field: 'fee', from: 'plan.nope' }] }]);
ok('rule: copying a linked field that isn’t there is refused', r.status === 400, JSON.stringify(r.body?.problems || r.body?.message));
const rule = {
	id: 'renew',
	name: 'Renew membership',
	on: ['create'],
	target: { via: 'member' },
	set: [
		{ field: 'expiresAt', from: 'until' },
		{ field: 'fee', from: 'plan.price' },
		{ field: 'plan', from: 'plan' },
	],
};
r = await publishRules([rule]);
ok('rule: Copy from Plan › Price published', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));

const later = new Date(Date.now() + 40 * DAY);
const cy = (await call('POST', P(`/${member.route}`), { name: 'Cy', expiresAt: later.toISOString() }, tok)).body?.doc;
r = await call('POST', P(`/${ren.route}`), { member: cy._id, plan: days10._id }, tok);
const r1 = r.body?.doc;
let C = await get(member.route, cy._id);
const want1 = new Date(later.getTime() + 20 * DAY).toISOString();
ok('renew before expiry: 20 days after the old expiry', r.status === 201 && iso(r1?.until) === want1, `${r.status} ${r.body?.message} ${iso(r1?.until)} want ${want1}`);
ok('…the member’s expiry moved on', iso(C?.expiresAt) === want1, iso(C?.expiresAt));
ok('…its fee from Plan › Price, through the link', C?.fee === 12 && r1?.fee === 12, [C?.fee, r1?.fee]);
const R1 = await get(ren.route, r1._id);
ok('once: the renewal kept its date after the member’s expiry moved', iso(R1?.until) === want1, iso(R1?.until));
r = await call('PUT', P(`/${ren.route}/${r1._id}`), { plan: monthly._id }, tok);
ok('once: kept on an edit too', iso((await get(ren.route, r1._id))?.until) === want1);

const dee = (await call('POST', P(`/${member.route}`), { name: 'Dee', expiresAt: '2026-01-01T00:00:00.000Z' }, tok)).body?.doc;
r = await call('POST', P(`/${ren.route}`), { member: dee._id, plan: monthly._id }, tok);
const D = await get(member.route, dee._id);
const now = new Date();
const wantMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, Math.min(now.getUTCDate(), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0)).getUTCDate()), now.getUTCHours(), now.getUTCMinutes());
ok('renew after it ran out: a month from today', r.status === 201 && near(D?.expiresAt, wantMonth), `${r.status} ${iso(D?.expiresAt)} ~ ${iso(wantMonth)}`);
ok('…fee 30 from the monthly plan', D?.fee === 30, D?.fee);

r = await call('DELETE', P(`/${ren.route}/${r.body?.doc?._id}`), null, tok);
ok('deleting the renewal puts the old date back', iso((await get(member.route, dee._id))?.expiresAt) === '2026-01-01T00:00:00.000Z', iso((await get(member.route, dee._id))?.expiresAt));

// Work out in a rule: a date formula over target.<field> and this.<link>.<field>.
r = await publishRules([
	{
		id: 'renew2',
		name: 'Renew (worked out)',
		on: ['create'],
		target: { via: 'member' },
		set: [
			{ field: 'expiresAt', formula: 'add(latest(target.expiresAt, today()), this.plan.length, this.plan.unit)' },
			{ field: 'fee', formula: 'this.plan.price * 2' },
		],
	},
]);
ok('rule: Work out with dates and this.plan.* published', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
const before = (await get(member.route, cy._id)).expiresAt;
r = await call('POST', P(`/${ren.route}`), { member: cy._id, plan: monthly._id }, tok);
C = await get(member.route, cy._id);
const b = new Date(before);
const wantCy = Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, Math.min(b.getUTCDate(), new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 2, 0)).getUTCDate()), b.getUTCHours(), b.getUTCMinutes(), b.getUTCSeconds(), b.getUTCMilliseconds());
ok('Work out: a month after the current expiry', r.status === 201 && iso(C?.expiresAt) === iso(wantCy), `${r.status} ${r.body?.message} ${iso(C?.expiresAt)} want ${iso(wantCy)}`);
ok('Work out: this.plan.price * 2', C?.fee === 60, C?.fee);

// A once date formula added later: older records get theirs on publish, and keep it after.
const memberNow = (await call('GET', P(`/builder/models/${member._id}`), null, tok)).body?.doc;
r = await call('PUT', P(`/builder/models/${member._id}`), { ...memberNow, fields: [...memberNow.fields, { key: 'since', label: 'Member since', kind: 'dateformula', calc: 'once', formula: 'today()' }] }, tok);
ok('a once date formula added to a model with records', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
const since = (await get(member.route, ann._id))?.since;
ok('…older records filled in when it was published', near(since, Date.now()), iso(since));
await call('PUT', P(`/${member.route}/${ann._id}`), { name: 'Ann B' }, tok);
ok('…and kept on the next save', iso((await get(member.route, ann._id))?.since) === iso(since));

done();
