import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';

dotenv.config();

/**
 * Seeds the two Vercel permission groups.
 *
 * The Permission model only has four fixed booleans (create/view/edit/delete)
 * per `key`, which is why this is two documents instead of one:
 *
 *  - key `vercel`     -> create-vercel / view-vercel / edit-vercel / delete-vercel
 *                        (accounts, projects, deployments, domains)
 *  - key `vercel-env` -> view-vercel-env (read environment variables AND build
 *                        logs, which print them), create-vercel-env relabelled
 *                        "Download", and edit-vercel-env to change them.
 *
 * **Every option here must be true if a route guards on its string.**
 * `getAdminPermissionList` builds the Role UI from these options, so an option
 * left false makes that permission ungrantable to every role except the `*`
 * super admin — the route then 403s for everyone else, silently. That is
 * exactly the bug that shipped on the Heroku side with `edit-heroku-config`.
 * The guards this must cover are in routes-admin/admin.router.ts under
 * `/vercels`; cross-check them before changing anything below.
 *
 * Run with:  npm run build && node scripts/seedVercelPermissions.js
 *
 * Safe to re-run: it upserts on `key`.
 */

const permissions = [
	{
		name: 'Vercel Accounts',
		description:
			'Connect, view, edit and remove stored Vercel accounts, and manage their projects, deployments and domains',
		key: 'vercel',
		isActive: true,
		options: {
			create: true,
			view: true,
			edit: true,
			delete: true,
		},
	},
	{
		name: 'Vercel Env Download',
		description:
			'Read, download and change a connected Vercel project’s environment variables, and read build logs. "Create" here means Download.',
		key: 'vercel-env',
		isActive: true,
		options: {
			create: true,
			view: true,
			edit: true,
			// No route guards on delete-vercel-env: removing a variable is part of
			// an environment batch, which edit-vercel-env already covers.
			delete: false,
		},
	},
];

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

const seedVercelPermissions = async () => {
	try {
		for (const permission of permissions) {
			const saved = await Permission.findOneAndUpdate({ key: permission.key }, permission, {
				upsert: true,
				new: true,
				setDefaultsOnInsert: true,
			});

			console.log(`Permission seeded: "${saved.name}" (key: ${saved.key}) id: ${saved._id.toString()}`);
		}
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seedVercelPermissions();
