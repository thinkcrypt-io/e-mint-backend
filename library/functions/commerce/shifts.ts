import { TenancyError } from '../tenancy.function.js';
import { Store, roundFor } from './store.js';
import { isId } from './catalogue.js';

/**
 * Registers and shifts (docs/ecommerce EC13): a register (till) at a store is
 * opened with the cash in its drawer, takes sales, cash in and out, and is
 * closed with a count — expected cash is the float + cash taken − cash
 * refunded + cash in − cash out. One open shift per register.
 */

export const openShift = async (store: Store, { register, openingFloat }: { register: any; openingFloat: any }, by: string) => {
	if (!store.features.includes('shifts')) throw new TenancyError(400, 'Shifts are switched off for this store');
	const reg: any = isId(register) ? await store.M('register').findById(register).lean() : null;
	if (!reg || reg.active === false) throw new TenancyError(400, 'Choose a register');
	const float = Number(openingFloat) || 0;
	if (float < 0) throw new TenancyError(400, 'The opening cash can’t be below 0');
	const Shift = store.M('shift');
	if (await Shift.exists({ register: reg._id, status: 'open' })) throw new TenancyError(409, `${reg.name} already has an open shift`, 'shift_open');
	return Shift.create({ register: reg._id, outlet: reg.outlet, status: 'open', openedBy: by, openedAt: new Date(), openingFloat: roundFor(store.answers.store.currency)(float), cashMoves: [], totals: [] });
};

export const currentShift = (store: Store, register: any) => (isId(register) ? store.M('shift').findOne({ register, status: 'open' }).lean() : null);

/** The shift a sale at this register goes on — required while shifts are on. */
export const shiftForSale = async (store: Store, register: any) => {
	if (!store.features.includes('shifts')) return null;
	const shift: any = await currentShift(store, register);
	if (!shift) throw new TenancyError(409, 'Open a shift on this register first', 'no_shift');
	return shift;
};

export const cashMove = async (store: Store, id: any, { type, amount, reason }: { type: string; amount: any; reason?: string }, by: string) => {
	const n = Number(amount);
	if (!['in', 'out'].includes(type) || !(n > 0)) throw new TenancyError(400, 'Cash in or out, and how much');
	const r = await store.M('shift').updateOne(
		{ _id: id, status: 'open' },
		{ $push: { cashMoves: { type, amount: roundFor(store.answers.store.currency)(n), reason: String(reason || '').slice(0, 200), by, at: new Date() } } }
	);
	if (!r.matchedCount) throw new TenancyError(409, 'This shift isn’t open');
	return summary(store, id);
};

/** What a shift took and gave back by method, and the cash that should be in the drawer. */
export const summary = async (store: Store, id: any) => {
	const round = roundFor(store.answers.store.currency);
	const shift: any = isId(id) ? await store.M('shift').findById(id).lean() : null;
	if (!shift) throw new TenancyError(404, 'Shift not found');
	const rows: any[] = await store.M('payment').find({ shift: shift._id, status: 'completed' }, { type: 1, method: 1, methodLabel: 1, amount: 1 }).lean();
	const by = new Map<string, { method: string; label: string; sales: number; refunds: number }>();
	for (const r of rows) {
		const t = by.get(r.method) || { method: r.method, label: r.methodLabel || r.method, sales: 0, refunds: 0 };
		if (r.type === 'refund') t.refunds = round(t.refunds + (Number(r.amount) || 0));
		else t.sales = round(t.sales + (Number(r.amount) || 0));
		by.set(r.method, t);
	}
	const totals = [...by.values()];
	const cash = by.get('cash') || { sales: 0, refunds: 0 };
	const moves = shift.cashMoves || [];
	const cashIn = round(moves.filter((m: any) => m.type === 'in').reduce((s: number, m: any) => s + (Number(m.amount) || 0), 0));
	const cashOut = round(moves.filter((m: any) => m.type === 'out').reduce((s: number, m: any) => s + (Number(m.amount) || 0), 0));
	const expectedCash = round((Number(shift.openingFloat) || 0) + cash.sales - cash.refunds + cashIn - cashOut);
	return { shift, totals, cashIn, cashOut, expectedCash, sales: rows.filter(r => r.type !== 'refund').length };
};

export const closeShift = async (store: Store, id: any, { countedCash, note }: { countedCash: any; note?: string }, by: string) => {
	const counted = Number(countedCash);
	if (!Number.isFinite(counted) || counted < 0) throw new TenancyError(400, 'Count the cash in the drawer');
	const round = roundFor(store.answers.store.currency);
	const s = await summary(store, id);
	if (s.shift.status !== 'open') throw new TenancyError(409, 'This shift is closed already');
	const r = await store.M('shift').updateOne(
		{ _id: s.shift._id, status: 'open' },
		{
			$set: {
				status: 'closed',
				closedBy: by,
				closedAt: new Date(),
				totals: s.totals,
				expectedCash: s.expectedCash,
				countedCash: round(counted),
				difference: round(counted - s.expectedCash),
				...(note && { note: String(note).slice(0, 500) }),
			},
		}
	);
	if (!r.modifiedCount) throw new TenancyError(409, 'This shift is closed already');
	return summary(store, id);
};
