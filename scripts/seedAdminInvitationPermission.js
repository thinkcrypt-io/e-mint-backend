import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';

dotenv.config();

/**
 * Seeds the "Admin Invitations" permission so it shows up as a checkbox group
 * on the Add/Edit Admin Role form (served via GET /permissionlist) and gates
 * the /admin-invitations routes (adminPermissions middleware checks for
 * `create-admin-invitation` / `edit-admin-invitation` / `delete-admin-invitation`
 * — the `key` here must stay `admin-invitation` to match those strings).
 *
 * Run with:  npm run build && node scripts/seedAdminInvitationPermission.js
 *
 * Safe to re-run: it upserts on `key`.
 */

const permission = {
	name: 'Admin Invitations',
	description: 'Invite new admins, and resend or cancel a pending invitation',
	key: 'admin-invitation',
	isActive: true,
	options: {
		create: true,
		view: true,
		edit: true,
		delete: true,
	},
};

const connectDB = async () => {
	const uri = process.env.MONGO_CONNECTION_URI;

	try {
		const conn = await mongoose.connect(uri);
		console.log(`Mongo DB connected: ${conn.connection.host}`);
	} catch (error) {
		console.log(`error: ${error.message}`);
		process.exit(1);
	}
};

const seedAdminInvitationPermission = async () => {
	try {
		const saved = await Permission.findOneAndUpdate({ key: permission.key }, permission, {
			upsert: true,
			new: true,
			setDefaultsOnInsert: true,
		});

		console.log(`Permission seeded: "${saved.name}" (key: ${saved.key})`);
		console.log(`  id: ${saved._id.toString()}`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seedAdminInvitationPermission();
