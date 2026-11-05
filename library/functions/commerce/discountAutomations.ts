import { saveSystemAutomation } from '../automations.function.js';
import { zoneOffset } from './zones.js';

/**
 * The store's discount automations (docs/ecommerce DISCOUNTS.md DS5): real Automation records marked
 * `system: 'commerce'` with a `key`, installed with the store and renewed by an upgrade — on/off only, their Runs
 * say what each did. All but D5 run one store action, “Work out the store's discounts”, on the products the record
 * touches (commerce/discounts.ts).
 *
 *   discount.saved            D1  a discount created, or its status, percentage, dates or what it applies to changed
 *   discount.deleted          D2  a discount deleted: the products that carried it
 *   discount.product-moved    D3  a product added, or moved to another category or collections
 *   discount.category-moved   D4  a category put under another one: its products (and those under it)
 *   discount.ends             D5  the end of its Ends day (store time zone): Status → inactive, Ended set (D1 follows)
 *   discount.starts           D6  the start of its Starts day: its products get it
 *
 * D5 and D6 run on the date trigger (EC-42). A day is kept as 00:00 UTC, so "the end of 5 Nov in Dhaka" is that
 * date + 1,080 minutes; the offset is worked out from the store's time zone when these are saved, and they are
 * renewed when Store settings change the zone (a zone with summer time is an hour out half the year — renewed
 * by the next upgrade or settings save).
 */
export const DISCOUNT_KEYS = ['discount.saved', 'discount.deleted', 'discount.product-moved', 'discount.category-moved', 'discount.ends', 'discount.starts'];

const WORK = [{ type: 'storeAction', action: 'workOutDiscounts' }];
const LOCKED = 'Installed by the store: switch it on or off, it can’t be changed.';

/** The date trigger's offsets for a zone: from a day's 00:00 UTC to its start, and to its end, there. */
export const dayOffsets = (tz: string) => {
	const off = zoneOffset(tz);
	return {
		start: { amount: Math.abs(off), unit: 'minutes', when: off > 0 ? 'before' : 'after' },
		end: { amount: 24 * 60 - off, unit: 'minutes', when: 'after' },
	};
};

const READY = (installed: Record<string, any>, tz: string) => {
	const discount = installed.discount?.route;
	const product = installed.product?.route;
	const category = installed.category?.route;
	if (!discount || !product) return [];
	const { start, end } = dayOffsets(tz);
	return [
		{
			key: 'discount.saved',
			body: {
				name: 'Discount saved → its products',
				description: `When a discount is added, or its status, percentage, dates or what it applies to change, its products — and those that had it — are worked out again: each gets the biggest active discount reaching it. ${LOCKED}`,
				route: discount,
				on: ['create', 'update'],
				changed: ['status', 'percent', 'startsAt', 'endsAt', 'products', 'categories', 'subCategories', 'collections'],
				actions: WORK,
			},
		},
		{
			key: 'discount.deleted',
			body: {
				name: 'Discount deleted → its products',
				description: `When a discount is deleted, the products that had it go back to their price, or to a smaller discount that reaches them. ${LOCKED}`,
				route: discount,
				on: ['delete'],
				actions: WORK,
			},
		},
		{
			key: 'discount.product-moved',
			body: {
				name: 'Product moved → its discount',
				description: `When a product is added, or moved to another category or collections, its discount is worked out again. ${LOCKED}`,
				route: product,
				on: ['create', 'update'],
				changed: ['category', 'collections'],
				actions: WORK,
			},
		},
		...(category
			? [
					{
						key: 'discount.category-moved',
						body: {
							name: 'Category moved → its products’ discount',
							description: `When a category is put under another one, its products (and those of the categories under it) have their discount worked out again. ${LOCKED}`,
							route: category,
							on: ['update'],
							changed: ['parent'],
							actions: WORK,
						},
					},
			  ]
			: []),
		{
			key: 'discount.ends',
			body: {
				name: 'Discount ends',
				description: `At the end of its Ends day (store time zone) a discount switches itself off — Status inactive, Ended set — and its products go back to their price. Off: discounts stay on past their end date. ${LOCKED}`,
				route: discount,
				on: ['date'],
				date: { field: 'endsAt', ...end },
				when: [{ field: 'status', op: 'is', value: 'active' }],
				actions: [{ type: 'update', target: 'this', set: [{ field: 'status', value: 'inactive' }, { field: 'endedAt', value: '{{today}}' }] }],
			},
		},
		{
			key: 'discount.starts',
			body: {
				name: 'Discount starts',
				description: `At the start of a discount’s Starts day (in the store’s time zone) its products get it. ${LOCKED}`,
				route: discount,
				on: ['date'],
				date: { field: 'startsAt', ...start },
				when: [{ field: 'status', op: 'is', value: 'active' }],
				actions: WORK,
			},
		},
	];
};

/** Puts the store's discount automations in, or renews them (their on/off switch kept). Returns what it added / renewed. Safe to run again. */
export const ensureDiscountAutomations = async (installed: Record<string, any>, tz: string, { apply = true } = {}) => {
	const out: string[] = [];
	for (const { key, body } of READY(installed, tz)) {
		try {
			const r = await saveSystemAutomation('commerce', key, body, { apply });
			if (r !== 'same') out.push(`“${body.name}” (${r})`);
		} catch (e: any) {
			console.error('discount automations:', key, e?.message, e?.extra || '');
		}
	}
	return out;
};
