import express from 'express';
import publicApiRouter from './public.router.js';
import { WIDGET_JS } from './widget.js';
import { TRACK_JS } from './track.js';

/**
 * /public — what a tenant project's own site or app talks to
 * (docs/multi-tenancy WO-11): its public API and the customer login widget.
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

router.get('/track.js', (_req, res) => {
	res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
	res.setHeader('Cache-Control', 'public, max-age=300');
	res.send(TRACK_JS);
});

router.use('/api/:project', publicApiRouter);

export default router;
