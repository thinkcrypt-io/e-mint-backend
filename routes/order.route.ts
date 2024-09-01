// Import necessary modules from their respective files
import express from 'express';
import constructConfig from '../lib/configurator/constructConfig.js';

import { protect, sort, query, ifExists, validate } from '../middleware/index.js';
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
} from '../controllers/common/index.js';

import Order, { settings } from '../models/order/order.model.js';
import getOrderTotal from '../controllers/order/getOrderTotal.js';
import addOrder from '../controllers/order/addOrder.controller.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Order,
	config: settings,
});

// Define common middleware
const commonMiddleware = [protect, sort, query(config.FILTER_OPTIONS)];
const postMiddleware = [protect, validate(config.VALIDATORS.POST)];
const updateMiddleware = [protect, validate(config.VALIDATORS.UPDATE)];

// Define the routes for the product store
router
	.route('/')
	.get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, addOrder);

router.get('/:id', protect, getDocumentById(config.QUERY_OPTIONS));

router.get('/edit/:id', protect, getDocumentToEditById(config.MODEL));

router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
router.delete('/:id', protect, deleteDocument(config.MODEL));
router.get('/get/count', protect, getCount(config.MODEL));

router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

router.put('/update/many', protect, updateManyDocuments(config.EDITS));
router.put('/copy/:id', protect, duplicateDocument(config.DUPLICATE_OPTIONS));

router.post('/cart-total', protect, getOrderTotal);

// Export the router
export default router;
