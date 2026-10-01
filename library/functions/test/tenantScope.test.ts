import mongoose, { Schema } from 'mongoose';
import { runInScope, runUnscoped, tenantScoped, withoutScope, scopeKey } from '../tenantScope.function';

/**
 * The tenancy guarantee (docs/multi-tenancy, D5): inside a tenant's scope a
 * query sees only that tenant's documents; with no scope (the super admin)
 * only documents with no organization; and inserts are stamped.
 *
 * Needs a throwaway MongoDB — set TEST_MONGO_URI (e.g. a local
 * `mongod --port 27999`); without one the suite is skipped. Never point it at
 * a real database: it drops its collection.
 */
const uri = process.env.TEST_MONGO_URI;
const d = uri ? describe : describe.skip;

d('tenantScoped plugin', () => {
	const schema = new Schema({ name: String, route: String });
	schema.plugin(tenantScoped);
	const Thing = mongoose.model('ScopedThing', schema, 'scoped_things_test');

	const orgA = new mongoose.Types.ObjectId();
	const orgB = new mongoose.Types.ObjectId();
	const projA = new mongoose.Types.ObjectId();
	const projB = new mongoose.Types.ObjectId();
	const A = { organization: orgA, project: projA };
	const B = { organization: orgB, project: projB };

	beforeAll(async () => {
		await mongoose.connect(uri!);
		await runUnscoped(() => Thing.deleteMany({}));
		await Thing.create({ name: 'admin-1', route: 'invoices' });
		await runInScope(A, () => Thing.create({ name: 'a-1', route: 'invoices' }));
		await runInScope(A, () => Thing.insertMany([{ name: 'a-2', route: 'clients' }]));
		await runInScope(B, () => Thing.create({ name: 'b-1', route: 'invoices' }));
	});

	afterAll(async () => {
		await runUnscoped(() => Thing.deleteMany({}));
		await mongoose.disconnect();
	});

	test('the super admin sees only documents with no organization', async () => {
		const names = (await Thing.find({}).lean()).map(t => t.name);
		expect(names).toEqual(['admin-1']);
		expect(await Thing.countDocuments({ route: 'invoices' })).toBe(1);
	});

	test('a tenant sees only its own project', async () => {
		const names = await runInScope(A, async () => (await Thing.find({}).sort('name').lean()).map(t => t.name));
		expect(names).toEqual(['a-1', 'a-2']);
		const one: any = await runInScope(B, () => Thing.findOne({ route: 'invoices' }).lean());
		expect(one.name).toBe('b-1');
	});

	test('inserts are stamped with the scope', async () => {
		const doc: any = await runInScope(A, () => Thing.findOne({ name: 'a-2' }).lean());
		expect(String(doc.organization)).toBe(String(orgA));
		expect(String(doc.project)).toBe(String(projA));
	});

	test("a tenant can't read, update or delete another's documents", async () => {
		const bId = (await runInScope(B, () => Thing.findOne({ name: 'b-1' }).lean()))!._id;
		expect(await runInScope(A, () => Thing.findById(bId).lean())).toBeNull();
		const upd = await runInScope(A, () => Thing.updateOne({ _id: bId }, { name: 'hijacked' }));
		expect(upd.matchedCount).toBe(0);
		const del = await runInScope(A, () => Thing.deleteOne({ _id: bId }));
		expect(del.deletedCount).toBe(0);
		const adminDel = await Thing.deleteOne({ _id: bId });
		expect(adminDel.deletedCount).toBe(0);
	});

	test('aggregate pipelines are confined too', async () => {
		const rows = await runInScope(A, () => Thing.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]));
		expect(rows[0].n).toBe(2);
	});

	test('withoutScope drops back to the super admin inside a tenant request', async () => {
		const names = await runInScope(A, () => withoutScope(async () => (await Thing.find({}).lean()).map(t => t.name)));
		expect(names).toEqual(['admin-1']);
		expect(runInScope(A, () => withoutScope(() => scopeKey()))).toBe('admin');
	});

	test('runUnscoped sees everything', async () => {
		expect(await runUnscoped(() => Thing.countDocuments({}))).toBe(4);
	});

	test("an existing document can't be saved from another scope", async () => {
		const doc = await runInScope(A, () => Thing.findOne({ name: 'a-1' }));
		doc!.name = 'moved';
		await expect(runInScope(B, () => doc!.save())).rejects.toThrow();
		await expect(doc!.save()).rejects.toThrow(); // nor by the super admin
	});
});
