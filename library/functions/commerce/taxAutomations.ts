import Automation from '../../models/tenancy/automation.model.js';
import { saveSystemAutomation } from '../automations.function.js';

/**
 * The store's tax automations (docs/ecommerce/TAX_AUTOMATIONS.md TX1, TX3): real Automation records marked
 * `system: 'commerce'` with a `key`, installed with the store and renewed by an upgrade. The owner can switch
 * them on and off and read their Runs; nothing else.
 *
 *   tax.category-to-products   a category's tax is given to every product in it (Price after tax follows)
 *   tax.product-new            a new product with no tax takes its category's
 *   tax.product-category       a product moved to another category takes that category's tax (if it has one)
 *   tax.product-to-variants    a product's tax is given to its variants
 *
 * A tax rate's own edit needs none: a formula reading it is worked out again wherever it is used.
 */
export const TAX_KEYS = ['tax.category-to-products', 'tax.product-new', 'tax.product-category', 'tax.product-to-variants'];

const READY = (installed: Record<string, any>) => {
	const category = installed.category?.route;
	const product = installed.product?.route;
	const variant = installed.variant?.route;
	const tax = installed.taxRate?.route;
	if (!category || !product || !tax) return [];
	return [
		{
			key: 'tax.category-to-products',
			body: {
				name: 'Category tax → its products',
				description: 'When a category’s Tax / VAT is set or changed, every product in it takes that tax and its Price after tax is worked out again. Installed by the store: switch it on or off, it can’t be changed.',
				route: category,
				on: ['update'],
				changed: ['taxRate'],
				when: [{ field: 'taxRate', op: 'filled' }],
				actions: [{ type: 'updateLinked', route: product, via: 'category', set: [{ field: 'taxRate', from: 'taxRate' }] }],
			},
		},
		{
			key: 'tax.product-new',
			body: {
				name: 'New product → its category’s tax',
				description: 'When a product is added without a Tax / VAT, it takes its category’s tax. Installed by the store: switch it on or off, it can’t be changed.',
				route: product,
				on: ['create'],
				when: [{ field: 'taxRate', op: 'empty' }],
				actions: [{ type: 'update', target: 'this', set: [{ field: 'taxRate', from: 'category.taxRate', ifFilled: true }] }],
			},
		},
		{
			key: 'tax.product-category',
			body: {
				name: 'Product’s category → its tax',
				description: 'When a product is moved to another category that has a Tax / VAT, the product takes it. Installed by the store: switch it on or off, it can’t be changed.',
				route: product,
				on: ['update'],
				changed: ['category'],
				actions: [{ type: 'update', target: 'this', set: [{ field: 'taxRate', from: 'category.taxRate', ifFilled: true }] }],
			},
		},
		...(variant
			? [
					{
						key: 'tax.product-to-variants',
						body: {
							name: 'Product tax → its variants',
							description: 'When a product’s Tax / VAT changes, its variants take it and their Price after tax is worked out again. Installed by the store: switch it on or off, it can’t be changed.',
							route: product,
							on: ['update'],
							changed: ['taxRate'],
							actions: [{ type: 'updateLinked', route: variant, via: 'product', set: [{ field: 'taxRate', from: 'taxRate', ifFilled: true }] }],
						},
					},
			  ]
			: []),
	];
};

/** Puts the store's tax automations in, or renews them (their on/off switch kept). Returns what it added / renewed. Safe to run again. */
export const ensureTaxAutomations = async (installed: Record<string, any>, { apply = true } = {}) => {
	const out: string[] = [];
	for (const { key, body } of READY(installed)) {
		try {
			const r = await saveSystemAutomation('commerce', key, body, { apply });
			if (r !== 'same') out.push(`“${body.name}” (${r})`);
		} catch (e: any) {
			console.error('tax automations:', key, e?.message, e?.extra || '');
		}
	}
	return out;
};

/** Whether the store has the category → products automation (on or off): then the old hard-wired hand-down stays quiet. */
export const hasCategoryTaxAutomation = async () => !!(await Automation.exists({ key: 'tax.category-to-products' }));
