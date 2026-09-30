import { Request, Response } from 'express';
import mongoose from 'mongoose';

/**
 * GET /admin/api/status — public, for the admin's System Status page.
 *
 * Whether the API answers (it does, if this runs) and whether the database
 * answers a ping, with how long that took. Deliberately nothing else: no
 * versions, hosts or counts, since anyone can call it.
 */
const systemStatus = async (_req: Request, res: Response): Promise<Response> => {
	const started = Date.now();
	let database: 'operational' | 'down' = 'down';
	let databaseMs: number | null = null;
	try {
		if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
			const t = Date.now();
			await mongoose.connection.db.admin().ping();
			databaseMs = Date.now() - t;
			database = 'operational';
		}
	} catch {
		database = 'down';
	}
	return res.status(200).json({
		api: 'operational',
		database,
		databaseMs,
		apiMs: Date.now() - started,
		uptime: Math.round(process.uptime()),
		checkedAt: new Date().toISOString(),
	});
};

export default systemStatus;
