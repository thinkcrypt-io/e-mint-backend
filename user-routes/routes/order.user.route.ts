import express from 'express';
import constructConfig from '../../lib/configurator/constructConfig.js';
import {
	getAllDocuments,
	getDocumentById,
} from '../../controllers/common/index.js';
import addUserOrder, {
	PendingPayment,
	reduceProductStock,
	sendOrderNotifications,
} from '../../controllers/order/addUserOrder.controller.js';
import getOrderTotal from '../../controllers/order/getOrderTotal.js';
import Order, { settings } from '../../models/order/order.model.js';
import { Shop } from '../../imports.js';
import {
	myData,
	userProtect as protect,
	sort,
	query,
} from '../../middleware/index.js';
import addSslSuccess from '../../controllers/order/addSslSuccess.controller.js';
import addSslFail from '../../controllers/order/addSslFail.controller.js';
import addSslCancel from '../../controllers/order/addSslCancel.controller.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Order,
	config: settings,
});

router.post('/', protect, addUserOrder);
router.get('/:id', getDocumentById({ model: Order }));

router.post('/cart-total', getOrderTotal);
router.get(
	'/',
	protect,
	myData({ field: 'customer' }),
	sort,
	query(config.FILTER_OPTIONS),
	getAllDocuments(config.QUERY_OPTIONS)
);

// Handle SSL payment
router.post('/success/:transId', addSslSuccess);
router.post('/fail/:transId', addSslFail);
router.post('/cancel/:transId', addSslCancel);

export default router;
