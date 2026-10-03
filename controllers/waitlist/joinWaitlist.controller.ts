import Joi from 'joi';
import Waitlist, { WAITLIST_TEAM_SIZES } from '../../models/waitlist/waitlist.model.js';

/**
 * POST /public/waitlist — the marketing website's "Join the waitlist" form
 * (mint-webpage). No token; rate-limited in routes-public/index.ts.
 *
 *   { email, name?, company?, role?, teamSize?, useCase?, source?, website? }
 *   → 201 { position, already: false } | 200 { position, already: true }
 *
 * One entry per email: signing up again fills in what was left blank and
 * answers with the place already held. `website` is a honeypot the form hides
 * from people — a bot that fills it gets a success and nothing is stored.
 */

const body = Joi.object({
	email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(200).required(),
	name: Joi.string().trim().max(120).allow(''),
	company: Joi.string().trim().max(120).allow(''),
	role: Joi.string().trim().max(120).allow(''),
	teamSize: Joi.string().valid(...WAITLIST_TEAM_SIZES, ''),
	useCase: Joi.string().trim().max(2000).allow(''),
	source: Joi.string().trim().max(200).allow(''),
	website: Joi.string().allow(''),
});

const DETAILS = ['name', 'company', 'role', 'teamSize', 'useCase'] as const;

/** Where `entry` stands: how many signed up before it, plus one. */
const positionOf = async (entry: any) => (await Waitlist.countDocuments({ createdAt: { $lt: entry.createdAt } })) + 1;

export const joinWaitlist = async (req: any, res: any) => {
	const { error, value } = body.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
	if (error) {
		const field = error.details[0].path[0];
		const message = field === 'email' ? 'Enter a valid email address.' : error.details[0].message.replace(/"/g, '');
		return res.status(400).json({ message, field });
	}

	try {
		if (value.website) return res.status(201).json({ position: 0, already: false });

		const existing = await Waitlist.findOne({ email: value.email });
		if (existing) {
			// Fill in what's new; never blank out what they told us before.
			let changed = false;
			for (const key of DETAILS) {
				if (value[key] && value[key] !== existing[key]) {
					existing[key] = value[key];
					changed = true;
				}
			}
			if (changed) await existing.save();
			return res.status(200).json({ position: await positionOf(existing), already: true });
		}

		const details = Object.fromEntries(DETAILS.filter(k => value[k]).map(k => [k, value[k]]));
		const entry = await Waitlist.create({ email: value.email, source: value.source || undefined, ...details });
		return res.status(201).json({ position: await positionOf(entry), already: false });
	} catch (e: any) {
		// Two sign-ups for one email at once: the other one won.
		if (e?.code === 11000) {
			const entry = await Waitlist.findOne({ email: value.email });
			if (entry) return res.status(200).json({ position: await positionOf(entry), already: true });
		}
		console.log('waitlist:', e?.message);
		return res.status(500).json({ message: 'Something went wrong — try again in a moment.' });
	}
};
