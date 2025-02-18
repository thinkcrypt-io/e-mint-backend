import express from 'express';
import { Brand as Model, brandSettings as settings } from '../models/index.js';
import { commonRouter } from '../imports.js';

const router = express.Router();

router.use(
	'/',
	commonRouter({
		Model: Model,
		settings: settings,
		permission: 'brand',
	})
);

export default router;
