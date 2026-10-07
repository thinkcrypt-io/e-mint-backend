/**
 * Conditional read-only fields: a field that can be changed (`edit`) until the
 * record reaches a state — a bill's status can move from draft to due, but not
 * once it is void or paid. The settings field carries `lockWhen`, conditions on
 * the record as it is saved now; when they all hold, the field keeps its value.
 *
 *   status: { edit: true, lockWhen: [{ field: 'status', op: 'in', value: ['void', 'paid'] }] }
 *
 * Checked against the stored record, not the incoming one, so the change that
 * sets a bill to paid goes through, and every change after it is refused.
 * Ops are the view tabs' (viewTabs[].where): is, not, in, gt, gte, lt, lte,
 * contains, empty, filled.
 */

export type LockCondition = { field: string; op: string; value?: any };

export const LOCK_OPS = ['is', 'not', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'filled'] as const;

const OP_TEXT: Record<string, string> = {
	is: 'is',
	not: 'is not',
	in: 'is one of',
	gt: 'is more than',
	gte: 'is at least',
	lt: 'is less than',
	lte: 'is at most',
	contains: 'contains',
	empty: 'is empty',
	filled: 'is not empty',
};

/** A stored value as plain data: an id or a populated record as its id, a date as its time. */
const plain = (v: any): any => {
	if (v === null || v === undefined) return v;
	if (Array.isArray(v)) return v.map(plain);
	if (v instanceof Date) return v.getTime();
	if (typeof v === 'object') {
		if (v._id) return String(v._id);
		if (typeof v.toHexString === 'function') return v.toHexString();
	}
	return v;
};

const isBlank = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

/** Compare as the field stores it: numbers as numbers, dates as times, the rest as text. */
const cmp = (a: any, b: any): number | null => {
	if (isBlank(a) || isBlank(b)) return null;
	const na = typeof a === 'number' ? a : Number(a);
	const nb = Number(b);
	if (typeof a === 'number' && Number.isFinite(nb)) return na - nb;
	const da = typeof a === 'number' ? a : Date.parse(String(a));
	const db = Date.parse(String(b));
	if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
	return String(a).localeCompare(String(b));
};

const eq = (a: any, b: any) => {
	if (typeof a === 'boolean') return a === (b === true || b === 'true' || b === 'yes');
	if (typeof a === 'number') return a === Number(b);
	return String(a ?? '') === String(b ?? '');
};

const listOf = (v: any): any[] => (Array.isArray(v) ? v : String(v ?? '').split(',').map(x => x.trim()).filter(Boolean));

/** Does one condition hold for this value? A list field holds when any of its items does. */
const holds = (raw: any, c: LockCondition): boolean => {
	const v = plain(raw);
	if (c.op === 'empty') return isBlank(v);
	if (c.op === 'filled') return !isBlank(v);
	if (Array.isArray(v)) return c.op === 'not' ? !v.some(x => eq(x, c.value)) : v.some(x => holds(x, c));
	switch (c.op) {
		case 'is':
			return eq(v, c.value);
		case 'not':
			return !eq(v, c.value);
		case 'in':
			return listOf(c.value).some(x => eq(v, x));
		case 'contains':
			return String(v ?? '').toLowerCase().includes(String(c.value ?? '').toLowerCase());
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte': {
			const d = cmp(v, c.value);
			if (d === null) return false;
			return c.op === 'gt' ? d > 0 : c.op === 'gte' ? d >= 0 : c.op === 'lt' ? d < 0 : d <= 0;
		}
		default:
			return false;
	}
};

const get = (doc: any, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);

/** Whether a record meets every condition (none: never). */
export const meets = (doc: any, conds?: LockCondition[]): boolean =>
	Array.isArray(conds) && conds.length > 0 && conds.every(c => c?.field && holds(get(doc, c.field), c));

/** "status is one of void, paid" — for the refusal and the form's hint. */
export const lockText = (conds: LockCondition[] = []) =>
	conds
		.map(c => {
			const op = OP_TEXT[c.op] || c.op;
			if (c.op === 'empty' || c.op === 'filled') return `${c.field} ${op}`;
			const value = Array.isArray(c.value) ? c.value.join(', ') : c.value;
			return `${c.field} ${op} ${value ?? ''}`.trim();
		})
		.join(' and ');

const same = (a: any, b: any) => JSON.stringify(plain(a) ?? null) === JSON.stringify(plain(b) ?? null);

/**
 * The fields an update would change that are locked on this record now:
 * `{ field, label, why }` each. Values sent unchanged pass — a form that sends
 * the whole record back isn't refused for a field nobody touched.
 */
export const lockedChanges = (
	settings: Record<string, any> = {},
	before: any,
	updates: Record<string, any> = {}
): { field: string; label: string; why: string }[] => {
	const out: { field: string; label: string; why: string }[] = [];
	for (const key of Object.keys(updates)) {
		const conds: LockCondition[] | undefined = settings[key]?.lockWhen;
		if (!conds?.length || !meets(before, conds)) continue;
		if (same(get(before, key), updates[key])) continue;
		out.push({ field: key, label: settings[key]?.schema?.label || settings[key]?.title || key, why: lockText(conds) });
	}
	return out;
};

/** The refusal for a locked change. */
export const lockedMessage = (locked: { label: string; why: string }[]) =>
	locked.map(l => `${l.label} can’t be changed any more (${l.why})`).join('; ');
