// Import necessary modules from their respective files
import express from 'express';
import constructConfig from '../lib/configurator/constructConfig.js';

import { protect, sort, query, validate, hasPermission, isExpired } from '../middleware/index.js';
import {
	deleteDocument,
	getFilters,
	updateDocument,
	getAllDocuments,
	getDocumentById,
	getDocumentToEditById,
	duplicateDocument,
	updateManyDocuments,
	exportDocument,
	getCount,
} from '../controllers/common/index.js';

import Order, { settings } from '../models/order/order.model.js';
import getOrderTotal from '../controllers/order/getOrderTotal.js';
import addOrder from '../controllers/order/addOrder.controller.js';
import getSum from '../controllers/common/getSum.controller.js';
import cancelOrder from '../controllers/order/cancelOrder.controller.js';
// import createSteadfastDelivery from '../controllers/order/createSteadfastDelivery.controller.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Order,
	config: settings,
});

// Define common middleware
const commonMiddleware = [
	protect,
	isExpired,
	sort,
	query(config.FILTER_OPTIONS),
	hasPermission(['view_order']),
];
const postMiddleware = [protect, validate(config.VALIDATORS.POST), hasPermission(['add_order'])];
const updateMiddleware = [
	protect,
	validate(config.VALIDATORS.UPDATE),
	hasPermission(['edit_order']),
];

const countMiddleware = [protect, query(config.FILTER_OPTIONS)];

// Define the routes for the product store
router
	.route('/')
	.get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, addOrder);

router.get('/:id', protect, hasPermission(['view_order']), getDocumentById(config.QUERY_OPTIONS));

router.get(
	'/edit/:id',
	protect,
	hasPermission(['view_order']),
	getDocumentToEditById(config.MODEL)
);

router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
router.delete('/:id', protect, cancelOrder);
router.get('/get/count', ...countMiddleware, getCount(config.MODEL));

router.get('/get/sum/:field', ...countMiddleware, getSum(config.MODEL));

router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

router.put(
	'/update/many',
	protect,
	hasPermission(['edit_order']),
	updateManyDocuments(config.EDITS)
);
router.put('/copy/:id', protect, duplicateDocument(config.DUPLICATE_OPTIONS));

router.post('/cart-total', protect, getOrderTotal);

// Steadfast delivery endpoint
// router.post('/steadfast-delivery', protect, hasPermission(['add_order']), createSteadfastDelivery);

// Export the router
export default router;
