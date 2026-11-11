import { TenancyError } from '../tenancy.function.js';
import type { Store } from './store.js';
import { isId } from './catalogue.js';
import { countView } from './search/rollup.js';

/**
 * Wishlists and product views for a store's website. Signed-in customers keep a wishlist (a guest's hearts live in
 * their browser and are joined on sign-in, docs/ecommerce CARTS_AND_WISHLISTS CW6); each product counts its wishes
 * (`wishlistCount`) and its page views (`views`). The engine alone writes both counters — never the plain forms.
 */

type Who = { email: string; name?: string };

const MAX_MERGE = 100;
const MAX_LIST = 200;

/** A product by its id or its web address; only an active one can be wished or counted. */
const findProduct = async (store: Store, ref: any) => {
	const Product = store.M('product');
	const key = String(ref || '').trim();
	if (!key) return null;
	const filter: any = isId(key) ? { _id: key } : { slug: key };
	const p: any = await Product.findOne(filter).lean();
	return p && p.status !== 'archived' && p.status !== 'draft' ? p : null;
};

const countOf = async (store: Store, product: any) => {
	const n = await store.M('wishlist').countDocuments({ product });
	await store.M('product').updateOne({ _id: product }, { $set: { wishlistCount: n } }, { timestamps: false });
	return n;
};

const shape = (row: any, product: any) => ({
	_id: String(row._id),
	product: product && {
		_id: String(product._id),
		name: product.name,
		slug: product.slug || '',
		price: Number(product.price) || 0,
		salePrice: product.salePrice != null ? Number(product.salePrice) : Number(product.price) || 0,
		image: product.images?.[0] || '',
		inStock: product.trackStock === false || (Number(product.totalStock) || 0) > 0,
	},
	variant: row.variant ? String(row.variant) : null,
	priceWhenAdded: row.priceWhenAdded ?? null,
	addedAt: row.addedAt || row.createdAt,
});

/** The customer's wishlist, newest first, with each product as it is now. */
export const myWishlist = async (store: Store, who: Who) => {
	const rows: any[] = await store.M('wishlist').find({ email: who.email.toLowerCase() }).sort({ addedAt: -1 }).limit(MAX_LIST).lean();
	const products: any[] = await store.M('product').find({ _id: { $in: rows.map(r => r.product) } }).lean();
	const by = new Map(products.map(p => [String(p._id), p]));
	return { doc: rows.filter(r => by.has(String(r.product))).map(r => shape(r, by.get(String(r.product)))) };
};

/** Adds a product (once per customer × product × variant); asking again is fine. */
export const addToWishlist = async (store: Store, who: Who, input: { product?: any; variant?: any }) => {
	const product = await findProduct(store, input.product);
	if (!product) throw new TenancyError(404, 'We couldn’t find that product.');
	const variant = input.variant && isId(input.variant) ? input.variant : null;
	const filter = { email: who.email.toLowerCase(), product: product._id, variant };
	const Wish = store.M('wishlist');
	let row: any = await Wish.findOne(filter).lean();
	if (!row) {
		const price = product.salePrice != null ? Number(product.salePrice) : Number(product.price) || 0;
		try {
			row = (await Wish.create({ ...filter, customerName: who.name || '', priceWhenAdded: price, addedAt: new Date() })).toObject();
		} catch (e: any) {
			row = await Wish.findOne(filter).lean();
			if (!row) throw e;
		}
		await countOf(store, product._id);
	}
	return shape(row, product);
};

/** Takes one of the customer's own wishes away — named by the wish's id, or by the product's (every wish of it). */
export const removeFromWishlist = async (store: Store, who: Who, id: any) => {
	const Wish = store.M('wishlist');
	const email = who.email.toLowerCase();
	const row: any = isId(id) ? await Wish.findOne({ _id: id, email }).lean() : null;
	const rows: any[] = row ? [row] : isId(id) ? await Wish.find({ product: id, email }).lean() : [];
	if (!rows.length) throw new TenancyError(404, 'That item isn’t on your wishlist.');
	await Wish.deleteMany({ _id: { $in: rows.map(r => r._id) } });
	await countOf(store, rows[0].product);
	return { ok: true };
};

/** A guest's hearts, joined to the account on sign-in; what's already there stays, nothing doubles. */
export const mergeWishlist = async (store: Store, who: Who, items: any) => {
	const list = (Array.isArray(items) ? items : []).slice(0, MAX_MERGE);
	for (const it of list) {
		try {
			await addToWishlist(store, who, typeof it === 'string' ? { product: it } : { product: it?.product, variant: it?.variant });
		} catch (e: any) {
			if (e?.status !== 404) throw e; // a product that's gone is left out
		}
	}
	return myWishlist(store, who);
};

/** One more view of a product's page. Counted by the store, so the browser can't pick the number. */
export const viewProduct = async (store: Store, ref: any) => {
	const product = await findProduct(store, ref);
	if (!product) throw new TenancyError(404, 'We couldn’t find that product.');
	await store.M('product').updateOne({ _id: product._id }, { $inc: { views: 1 } }, { timestamps: false });
	// By day on its search document too: the last 30 days' views rank it (docs/search SI-13).
	countView(product._id);
	return { ok: true };
};
