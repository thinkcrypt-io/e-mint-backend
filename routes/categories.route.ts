import express from 'express';
import { Collection as Model, collectionSettings as settings } from '../models/index.js';
import { commonRouter } from '../imports.js';

const router = express.Router();

router.use(
	'/',
	commonRouter({
		Model: Model,
		settings: settings,
		permission: 'collection',
	})
);

export default router;
