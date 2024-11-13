import express from 'express';
import { store, filter, paginate, getAppCart } from '../middlewares/index.js';

import { constructConfig, getAllDocuments, getDocumentById } from '../../imports.js';
import { Product, productSettings } from '../../imports.js';

const config = constructConfig({
	model: Product,
	config: productSettings,
});

const router = express.Router();

router.get(
	'/',
	store,
	paginate,
	filter(config.FILTER_OPTIONS),
	getAllDocuments(config.QUERY_OPTIONS)
);

router.get('/:id', store, getDocumentById(config.QUERY_OPTIONS));

router.post('/get-cart', store, getAppCart);

export default router;
