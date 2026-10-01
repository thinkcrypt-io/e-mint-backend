import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * A throwaway local database for testing multi-tenancy end to end
 * (docs/multi-tenancy): one super admin with a `*` role, so the admin API can
 * be exercised next to the tenant API on the same server.
 *
 * LOCAL ONLY — refuses any MONGO_CONNECTION_URI that isn't 127.0.0.1/localhost.
 *
 *   mongod --dbpath <scratch> --port 27999
 *   MONGO_CONNECTION_URI=mongodb://127.0.0.1:27999/emint_tenancy_dev node scripts/seedTenancyDev.js
 *   (then the `backend-test` launch config: the server on :5001 against it)
 *
 * Test account (dev only — never a real credential):
 *   admin@example.com / tenancy-dev-pass-1
 * Mail to example.com is written to the server log in development, so 2FA
 * codes and invitation links can be read there.
 */

export const DEV_ADMIN = { email: 'admin@example.com', password: 'tenancy-dev-pass-1', name: 'Dev Super Admin' };

const uri = process.env.MONGO_CONNECTION_URI || '';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(uri)) {
	console.error('Refusing: MONGO_CONNECTION_URI must point at a local throwaway database.');
	process.exit(1);
}

const run = async () => {
	await mongoose.connect(uri);
	const { default: AdminRole } = await import('../dist/library/models/admin-role/model.js');
	const { default: Admin } = await import('../dist/library/models/admin/model.js');

	let role = await AdminRole.findOne({ name: 'SUPER-ADMIN' });
	if (!role) role = await AdminRole.create({ name: 'SUPER-ADMIN', permissions: ['*'], isActive: true });

	let admin = await Admin.findOne({ email: DEV_ADMIN.email });
	if (!admin) {
		admin = new Admin({ ...DEV_ADMIN, role: role._id, isActive: true, username: 'devadmin' });
		await admin.save();
		console.log('Created', DEV_ADMIN.email);
	} else console.log('Exists', DEV_ADMIN.email);

	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
