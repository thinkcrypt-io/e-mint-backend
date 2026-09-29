import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * For an admin locked out of two-factor sign-in (lost the passkey device, no
 * access to their email, no backup codes left): turns 2FA off for that
 * account, so their password alone signs them in. Their passkeys are kept
 * unless --remove-passkeys is given. They can turn 2FA on again in Settings.
 *
 * Run with:  node scripts/resetTwoFactor.js person@example.com [--remove-passkeys]
 *
 * Raw collections rather than dist models, so it runs without a build.
 */

const [email, flag] = process.argv.slice(2);

const run = async () => {
	if (!email) {
		console.log('Usage: node scripts/resetTwoFactor.js <admin email> [--remove-passkeys]');
		process.exit(1);
	}
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const db = mongoose.connection.db;
	const admin = await db.collection('admins').findOne({ email: String(email).trim().toLowerCase() });
	if (!admin) {
		console.log(`No admin with the email ${email}.`);
	} else {
		await db
			.collection('admins')
			.updateOne({ _id: admin._id }, { $set: { twoFactorEnabled: false, twoFactorUpdatedAt: new Date() }, $unset: { twoFactorBackupCodes: 1 } });
		await db.collection('twofactorchallenges').deleteMany({ admin: admin._id });
		let removed = 0;
		if (flag === '--remove-passkeys') removed = (await db.collection('passkeys').deleteMany({ admin: admin._id })).deletedCount;
		console.log(`Two-factor sign-in is off for ${admin.email}${flag === '--remove-passkeys' ? ` — ${removed} passkey(s) removed` : ''}.`);
	}
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e.message);
	process.exit(1);
});
