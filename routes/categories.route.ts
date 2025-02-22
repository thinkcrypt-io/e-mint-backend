import express from 'express';
import { Category as Model, categorySettings as settings } from '../models/index.js';
import { commonRouter } from '../imports.js';

const router = express.Router();

router.use(
	'/',
	commonRouter({
		Model: Model,
		settings: settings,
		permission: 'category',
	})
);

export default router;
