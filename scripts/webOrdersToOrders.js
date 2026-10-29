import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { runInScope, runUnscoped } from '../dist/library/functions/tenantScope.function.js';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';
import ModelDefinition from '../dist/library/models/builder/modelDefinition.model.js';
import { compiledModel } from '../dist/library/functions/dynamicModels.function.js';
import { storeOf } from '../dist/library/functions/commerce/store.js';
import { settleOrder, recordPayment } from '../dist/library/functions/commerce/payments.js';

dotenv.config();

/**
 * EC-25 (docs/ecommerce): a store's "Online orders" copied into its Orders as website orders — same number (WO-0001),
 * same date, the address, area, slot and contact, items matched to the catalogue by SKU (so a return can put stock back).
 * Stock is NOT touched (those orders were already handled by staff); delivered orders get the cash payment they were
 * delivered on. Safe to re-run: an order whose number is already there is left alone.
 *
 * Run with:  node scripts/webOrdersToOrders.js          (dry run)
 *            node scripts/webOrdersToOrders.js --apply
 */

const apply = process.argv.includes('--apply');
const MAP = {
	new: { status: 'open', fulfilment: 'unfulfilled' },
	confirmed: { status: 'open', fulfilment: 'confirmed' },
	out_for_delivery: { status: 'open', fulfilment: 'shipped' },
	delivered: { status: 'completed', fulfilment: 'delivered' },
	cancelled: { status: 'cancelled', fulfilment: 'cancelled' },
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const projects = await runUnscoped(() => TenantProject.find({ type: 'ecommerce' }, { name: 1, organization: 1 }).lean());
	for (const p of projects) {
		await runInScope({ organization: p.organization, project: p._id }, async () => {
			const def = await ModelDefinition.findOne({ route: 'online-orders', active: { $ne: false } }).lean();
			if (!def) return console.log(`${p.name}: no Online orders`);
			const store = await storeOf();
			const Web = compiledModel(def.name);
			const Order = store.M('order');
			const outlet = await store.M('outlet').findOne({ kind: 'store', active: { $ne: false } }).sort({ createdAt: 1 }).lean();
			if (!outlet) return console.log(`${p.name}: no store outlet`);
			const rows = await Web.find({}).sort({ createdAt: 1 }).lean();
			let made = 0;
			let skipped = 0;
			for (const w of rows) {
				if (await Order.exists({ code: w.code })) {
					skipped++;
					continue;
				}
				const items = [];
				for (const it of w.items || []) {
					const v = it.sku ? await store.M('variant').findOne({ sku: it.sku }, { _id: 1, product: 1 }).lean() : null;
					const quantity = Number(it.quantity) || 0;
					const unitPrice = Number(it.unitPrice) || 0;
					items.push({ ...(v && { variant: String(v._id), product: String(v.product) }), name: it.name, sku: it.sku || '', quantity, unitPrice, discount: 0, tax: 0, total: quantity * unitPrice, returned: 0 });
				}
				const subtotal = Number(w.subtotal) || items.reduce((s, i) => s + i.total, 0);
				const shipping = Number(w.deliveryCharge) || 0;
				const note = String(w.note || '');
				const slot = (note.match(/Deliver:\s*([^·]+)/) || [])[1]?.trim() || '';
				const st = MAP[w.status] || MAP.new;
				const doc = new Order({
					channel: 'website',
					...st,
					outlet: outlet._id,
					items,
					subtotal,
					shipping,
					total: subtotal + shipping,
					email: String(w.email || '').toLowerCase(),
					slot,
					paymentMethod: w.paymentMethod || 'cod',
					cashier: 'Website',
					delivery: { name: w.customerName, phone: w.phone, address: w.address, area: w.area || '', email: String(w.email || '').toLowerCase() },
					note: note.replace(/Deliver:[^·]*·?\s*/, '').trim() || undefined,
					...(st.status === 'completed' && { completedAt: w.updatedAt || w.createdAt }),
					createdAt: w.createdAt,
				});
				doc.$locals.code = w.code;
				made++;
				if (!apply) continue;
				await doc.save();
				if (w.status === 'delivered') await recordPayment(store, { order: doc._id, type: 'payment', method: 'cash', methodLabel: 'Cash on delivery', amount: doc.total, outlet: outlet._id, by: 'Migration' });
				await settleOrder(store, doc._id);
			}
			console.log(`${p.name}: ${rows.length} online order(s) — ${made} ${apply ? 'copied' : 'would be copied'}, ${skipped} already there`);
		});
	}
	console.log(apply ? '\nDone.' : '\nDry run — nothing written. Add --apply to copy them.');
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
