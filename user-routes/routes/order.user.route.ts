// Import necessary modules from their respective files
import express from 'express';
import constructConfig from '../../lib/configurator/constructConfig.js';

import {
	deleteDocument,
	getFilters,
	createDocument,
	updateDocument,
	getAllDocuments,
	getDocumentById,
	getDocumentToEditById,
	duplicateDocument,
	updateManyDocuments,
	exportDocument,
	getCount,
} from '../../controllers/common/index.js';

import cancelOrder from '../../controllers/order/cancelOrder.controller.js';
import addUserOrder, { restoreProductStock } from '../../controllers/order/addUserOrder.controller.js';
import getUserCartTotal from '../../controllers/order/getUserCartTotal.js';
import getOrderTotal from '../../controllers/order/getOrderTotal.js';
import Order, { settings } from '../../models/order/order.model.js';

import {
	myData,
	userProtect as protect,
	sort,
	query,
} from '../../middleware/index.js';

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

router.post('/success/:transId', async (req, res) => {
	// res.redirect(`${process.env.WEBSITE}/payment/success/${req.params.transId}`);
	// console.log('check 1', req.params.transId);
	const result = await Order.updateOne(
		{ trnxRef: req.params.transId },
		{
			$set: {
				isPaid: true,
			},
		}
	);
	if (result?.modifiedCount > 0) {
	res.redirect(`${process.env.WEBSITE}/payment/success/${req.params.transId}`);
	}
});

// router.post('/fail/:transId', async (req, res) => {
// 	// res.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
// 	// console.log('check 2', req.params.transId);
// 	const result = await Order.deleteOne({
// 		trnxRef: req.params.transId,
// 	});
	
// 	if (result?.deletedCount > 0) {
// 		res.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
// 	}
// });

router.post('/fail/:transId', async (req, res) => {
	try {
		// First find the order to get the items before deleting
		const order = await Order.findOne({ trnxRef: req.params.transId });

		if (!order) {
			return res
				.status(404)
				.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
		}

		// Restore stock for all items in the order
		await restoreProductStock(order.items);

		// Then delete the order
		const result = await Order.deleteOne({ trnxRef: req.params.transId });

		if (result?.deletedCount > 0) {
			return res.redirect(
				`${process.env.WEBSITE}/payment/fail/${req.params.transId}`
			);
		} else {
			return res.status(500).redirect(`${process.env.WEBSITE}/payment/error`);
		}
	} catch (error) {
		console.error('Error in payment failure handling:', error);
		return res.status(500).redirect(`${process.env.WEBSITE}/payment/error`);
	}
});

// // Define common middleware
// const commonMiddleware = [
// 	//protect,
// 	sort,
// 	query(config.FILTER_OPTIONS),
// ];
// const postMiddleware = [protect, ifExists(config.EXIST_OPTIONS), validate(config.VALIDATORS.POST)];
// const updateMiddleware = [
// 	protect,
// 	ifExists(config.EXIST_OPTIONS),
// 	validate(config.VALIDATORS.UPDATE),
// ];

// // Define the routes for the product store
// router.route('/').get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS));
// // .post(...postMiddleware, hasPermission(['add_product']), createDocument(config.MODEL));

// router.get('/:id', getDocumentById(config.QUERY_OPTIONS));

// router.get(
// 	'/edit/:id',
// 	protect,
// 	hasPermission(['view_product']),
// 	getDocumentToEditById(config.MODEL)
// );

// router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
// // router.put(
// // 	'/:id',
// // 	...updateMiddleware,
// // 	hasPermission(['edit_product']),
// // 	updateDocument(config.EDITS)
// // );
// // router.delete('/:id', protect, hasPermission(['delete_product']), deleteDocument(config.MODEL));
// router.get('/get/count', protect, getCount(config.MODEL));

// // router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

// // router.put('/update/many', protect, hasPermission(['edit']), updateManyDocuments(config.EDITS));
// // router.put('/copy/:id', protect, duplicateDocument(config.DUPLICATE_OPTIONS));

// router.put('/:id/cancel', protect, cancelOrder);

// Export the router
export default router;
