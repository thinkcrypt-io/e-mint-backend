import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../dist/library/models/admin/model.js';

dotenv.config();

/**
 * Backfills `modalLayout: 'drawer'` onto every existing Admin document that
 * doesn't already have the field set.
 *
 * The schema default (see library/models/admin/model.ts) only applies to
 * documents created from here on — Mongoose does not retroactively write
 * defaults into documents already in the database, it only fills them in at
 * read time when the field is absent. This script makes the value concrete
 * in the DB itself instead of relying on that read-time fallback.
 *
 * Run with:  npm run build && node scripts/seedAdminModalLayout.js
 *
 * Safe to re-run: it only touches documents where modalLayout is missing.
 */

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

const seedAdminModalLayout = async () => {
	try {
		const result = await Admin.updateMany(
			{ modalLayout: { $exists: false } },
			{ $set: { modalLayout: 'drawer' } }
		);

		console.log(`Admins matched : ${result.matchedCount}`);
		console.log(`Admins updated : ${result.modifiedCount}`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seedAdminModalLayout();
