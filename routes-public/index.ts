import express from 'express';
import publicApiRouter from './public.router.js';
import { WIDGET_JS } from './widget.js';
import { TRACK_JS } from './track.js';
import crypto from 'crypto';
import { MINT_JS } from './mint.js';
import { LOGIN_WIDGET_JS } from './widgets/login.js';
import { CART_WIDGET_JS } from './widgets/cart.js';
import { joinWaitlist } from '../controllers/waitlist/joinWaitlist.controller.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import { countryByCode, countryPicture, listCountries } from '../library/functions/countries.function.js';
import { apiOrigin } from '../library/controllers/mcp/website.tools.js';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import { stripeWebhook } from '../library/functions/payments.function.js';

/**
 * /public — what a tenant project's own site or app talks to
 * (docs/multi-tenancy WO-11): its public API and the customer login widget.
 * Also the marketing website's waitlist form (POST /waitlist), and the
 * countries list (docs/widgets W-02) for sign-up and for widgets.
 * No admin or tenant token; CORS is open (app-wide cors()).
 */
const router = express.Router();

// Loaded from tenants' own sites: helmet's default same-origin resource policy
// would stop a browser running widget.js there.
router.use((_req, res, next) => {
	res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
	next();
});

router.get('/widget.js', (_req, res) => {
	res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
	res.setHeader('Cache-Control', 'public, max-age=300');
	res.send(WIDGET_JS);
});

/* Site widgets (docs/widgets W-03): the runtime, and each widget's script. */
const WIDGET_SCRIPTS: Record<string, string> = { login: LOGIN_WIDGET_JS, cart: CART_WIDGET_JS };
// Changes whenever any of the scripts does, so widget files can be cached hard.
const WIDGETS_VERSION = crypto
	.createHash('sha256')
	.update(MINT_JS + Object.values(WIDGET_SCRIPTS).join(''))
	.digest('hex')
	.slice(0, 10);
const MINT_SERVED = MINT_JS.replace('__VERSION__', WIDGETS_VERSION);

router.get('/mint.js', (_req, res) => {
	res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
	res.setHeader('Cache-Control', 'public, max-age=300');
	res.send(MINT_SERVED);
});

router.get('/widgets/:name.js', (req, res) => {
	const js = Object.prototype.hasOwnProperty.call(WIDGET_SCRIPTS, req.params.name) ? WIDGET_SCRIPTS[req.params.name] : null;
	if (!js) return res.status(404).json({ message: 'No such widget' });
	res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
	// Asked for with ?v=<version>: a new version is a new address.
	res.setHeader('Cache-Control', req.query.v === WIDGETS_VERSION ? 'public, max-age=86400' : 'public, max-age=300');
	res.send(js);
});

router.get('/track.js', (_req, res) => {
	res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
	res.setHeader('Cache-Control', 'public, max-age=300');
	res.send(TRACK_JS);
});

// The marketing website's "Join the waitlist" (mint-webpage).
router.post('/waitlist', rateLimit({ name: 'waitlist', windowMs: 15 * 60 * 1000, max: 10 }), joinWaitlist);

/* Countries (docs/widgets W-02): the list, one, and each one's flag and map. */
const withPictures = (req: any, c: any) => ({
	...c,
	flagUrl: `${apiOrigin(req)}/public/countries/${c.code.toLowerCase()}/flag.svg`,
	mapUrl: `${apiOrigin(req)}/public/countries/${c.code.toLowerCase()}/map.svg`,
});

router.get('/countries', async (req, res) => {
	try {
		res.setHeader('Cache-Control', 'public, max-age=300');
		res.json({ doc: (await listCountries()).map(c => withPictures(req, c)) });
	} catch {
		res.status(500).json({ message: 'Could not load the countries' });
	}
});

router.get('/countries/:code/:picture(flag|map).svg', async (req, res) => {
	try {
		const svg = /^[a-z]{2}$/i.test(req.params.code) ? await countryPicture(req.params.code, req.params.picture as 'flag' | 'map') : null;
		if (!svg) return res.status(404).json({ message: 'No such picture' });
		res.setHeader('Content-Type', 'image/svg+xml');
		res.setHeader('Cache-Control', 'public, max-age=86400');
		// An SVG opened on its own runs no script of ours or anyone's.
		res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
		res.send(svg);
	} catch {
		res.status(500).json({ message: 'Could not load the picture' });
	}
});

router.get('/countries/:code', async (req, res) => {
	await listCountries();
	const c = countryByCode(req.params.code);
	if (!c) return res.status(404).json({ message: 'No such country' });
	res.setHeader('Cache-Control', 'public, max-age=300');
	res.json(withPictures(req, c));
});

/*
 * Payment providers' webhooks (docs/widgets W-06): only these can mark an
 * order paid. The signature is checked against the project's own signing
 * secret on the raw body (server.ts keeps it for /public/payments/).
 */
router.post('/payments/stripe/:project', async (req: any, res) => {
	try {
		const slug = String(req.params.project || '').toLowerCase();
		const project: any = /^[a-z0-9-]{1,120}$/.test(slug) ? await TenantProject.findOne({ publicSlug: slug }).lean() : null;
		if (!project || project.isActive === false) return res.status(404).json({ message: 'Not found' });
		res.json(await stripeWebhook(req.app, project, req.rawBody, String(req.headers['stripe-signature'] || '')));
	} catch (e: any) {
		const status = e?.status || 500;
		if (status === 500) console.error('stripe webhook:', e);
		// A 5xx makes Stripe try again later; a 400 (bad signature) doesn't.
		res.status(status).json({ message: status === 500 ? 'Something went wrong' : e.message });
	}
});

router.use('/api/:project', publicApiRouter);

export default router;
