import express from 'express';
import { store, filter, paginate, getAppCart } from '../middlewares/index.js';

import { constructConfig, getAllDocuments, getDocumentById } from '../../imports.js';
import { Product, productSettings } from '../../imports.js';
import addAppOrder from './addAppOrder.js';

const config = constructConfig({
	model: Product,
	config: productSettings,
});

const router = express.Router();

router.post('/', store, addAppOrder);
router.post('/get-cart', store, getAppCart);

export default router;
