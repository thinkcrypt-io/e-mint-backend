import express from 'express';
import { store, getAppCart, verifyCoupon } from '../middlewares/index.js';
import { constructConfig, getAllDocuments, getDocumentById } from '../../imports.js';
import { Product, productSettings } from '../../imports.js';
import addAppOrder from './addAppOrder.js';
import getInvoice from './getInvoice.controller.js';
import addGuestSslSuccess from './addGuestSslSuccess.controller.js';
import addGuestSslFail from './addGuestSslFail.controller.js';
import addGuestSslCancel from './addGuestSslCancel.controller.js';

const config = constructConfig({
	model: Product,
	config: productSettings,
});

const router = express.Router();

router.post('/', store, addAppOrder);
router.post('/get-cart', store, getAppCart);
router.post('/verify-coupon', store, verifyCoupon);
router.get('/invoice/:id', getInvoice);

// Handle SSL payment
router.post('/success/:transId', addGuestSslSuccess);
router.post('/fail/:transId', addGuestSslFail);
router.post('/cancel/:transId', addGuestSslCancel);

export default router;
