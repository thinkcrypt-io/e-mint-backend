import express from 'express';
import { store, filter, paginate, getAppCart, verifyCoupon } from '../middlewares/index.js';

import { constructConfig, getAllDocuments, getDocumentById } from '../../imports.js';
import { Product, productSettings } from '../../imports.js';
import addAppOrder from './addAppOrder.js';
import getInvoice from './getInvoice.controller.js';

const config = constructConfig({
	model: Product,
	config: productSettings,
});

const router = express.Router();

router.post('/', store, addAppOrder);
router.post('/get-cart', store, getAppCart);
router.post('/verify-coupon', store, verifyCoupon);
router.get('/invoice/:id', getInvoice);

export default router;
