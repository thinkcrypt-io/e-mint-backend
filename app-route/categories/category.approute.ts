import express from 'express';
import { store, filter, paginate } from '../middlewares/index.js';

import { constructConfig, getAllDocuments, getDocumentById } from '../../imports.js';
import { Category, categorySettings } from '../../imports.js';

const config = constructConfig({
	model: Category,
	config: categorySettings,
});

const router = express.Router();

router.get(
	'/',
	store,
	paginate,
	filter(config.FILTER_OPTIONS),
	getAllDocuments(config.QUERY_OPTIONS)
);

export default router;
