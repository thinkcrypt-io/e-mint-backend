// Import necessary modules from their respective files
import express from 'express';
import constructConfig from '../../lib/configurator/constructConfig.js';

import { protect, sort, query, ifExists, validate, hasPermission } from '../../middleware/index.js';
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

import addOrder from '../../controllers/order/addOrder.controller.js';
import cancelOrder from '../../controllers/order/cancelOrder.controller.js';
import Category, { settings } from '../../models/category/category.model.js';
import { shop } from '../../middleware/userAuth.middleware.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Category,
	config: settings,
});

// Define common middleware
const commonMiddleware = [
	//protect,
	shop,
	sort,
	query(config.FILTER_OPTIONS),
];
const postMiddleware = [protect, ifExists(config.EXIST_OPTIONS), validate(config.VALIDATORS.POST)];
const updateMiddleware = [
	protect,
	ifExists(config.EXIST_OPTIONS),
	validate(config.VALIDATORS.UPDATE),
];

// Define the routes for the product store
router.route('/').get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS));
// .post(...postMiddleware, hasPermission(['add_product']), createDocument(config.MODEL));

router.get('/:id', getDocumentById(config.QUERY_OPTIONS));

// router.get(
// 	'/edit/:id',
// 	protect,
// 	hasPermission(['view_product']),
// 	getDocumentToEditById(config.MODEL)
// );

router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
// router.put(
// 	'/:id',
// 	...updateMiddleware,
// 	hasPermission(['edit_product']),
// 	updateDocument(config.EDITS)
// );
// router.delete('/:id', protect, hasPermission(['delete_product']), deleteDocument(config.MODEL));
router.get('/get/count', protect, shop, getCount(config.MODEL));

// router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

// router.put('/update/many', protect, hasPermission(['edit']), updateManyDocuments(config.EDITS));
// router.put('/copy/:id', protect, duplicateDocument(config.DUPLICATE_OPTIONS));

router.put('/:id/cancel', protect, cancelOrder);

// Export the router
export default router;
