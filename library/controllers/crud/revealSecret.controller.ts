import { Response } from 'express';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import Admin from '../../models/admin/model.js';
import TenantUser from '../../models/tenancy/tenantUser.model.js';
import { currentScope } from '../../functions/tenantScope.function.js';
import { isSecretPath, openSecret } from '../../functions/secretFields.function.js';

/**
 * POST /<route>/:id/reveal { field, password } — one Password field of one
 * record, readable (secretFields.function.ts).
 *
 * Mounted behind the route's single-record read (permission, then per-record
 * access, which narrows `req.queryHelper`), and it asks again for the
 * person's own sign-in password: an open laptop isn't enough. A wrong one is
 * a 400, not a 401 — the panel signs people out on a 401.
 */
const revealSecret = (Model: mongoose.Model<any>) => async (req: any, res: Response) => {
	try {
		const field = String(req.body?.field || '');
		const password = String(req.body?.password || '');
		if (!field || !isSecretPath(Model.schema, field)) return res.status(400).json({ message: 'That isn’t a password field.' });
		if (!password) return res.status(400).json({ message: 'Enter your password.', code: 'password_required' });
		if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Document Not Found' });

		const People: mongoose.Model<any> = currentScope() ? TenantUser : (Admin as any);
		const me: any = await People.findById(req.user?._id).select('+password').lean();
		if (!me?.password || !(await bcrypt.compare(password, me.password)))
			return res.status(400).json({ message: 'That password isn’t right.', code: 'wrong_password' });

		const doc: any = await Model.findOne({ ...(req.queryHelper || {}), _id: req.params.id })
			.select(`+${field}`)
			.setOptions({ revealSecrets: true })
			.lean();
		if (!doc) return res.status(404).json({ message: 'Document Not Found' });

		res.set('Cache-Control', 'no-store');
		return res.status(200).json({ value: openSecret(doc[field]) });
	} catch (e: any) {
		console.error('revealSecret', e?.message);
		return res.status(500).json({ message: 'Couldn’t open the stored value.' });
	}
};

export default revealSecret;
