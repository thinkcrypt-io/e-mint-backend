// Import necessary modules from their respective files
import express from 'express';

import Product, { settings } from '../models/products/products.model.js';
import cancelOrder from '../controllers/order/cancelOrder.controller.js';
import topSellingProductController from '../controllers/top/topSellingProduct.controller.js';
import { Filter } from '../lib/types/settings.types.js';
import Order from '../models/order/order.model.js';
import { orderStatus } from '../models/order/order.settings.js';
import {
	getSum,
	constructConfig,
	getInventoryCount,
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
	protect,
	sort,
	query,
	ifExists,
	validate,
	hasPermission,
} from '../imports.js';

type TopProductsFilters = {
	[key: string]: { filter: Filter; sort?: boolean };
};

const topProductsFilters: TopProductsFilters = {
	createdAt: {
		sort: true,
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Date',
			title: 'Filter by Date',
		},
	},
	status: {
		sort: true,
		filter: {
			name: 'Status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Order Status',
			title: 'Sort by order status',
			options: orderStatus,
		},
	},
};

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Product,
	config: settings,
});

const topProductConfig = constructConfig({
	model: Order,
	config: topProductsFilters,
});

// Define common middleware
const commonMiddleware = [protect, sort, query(config.FILTER_OPTIONS)];
const postMiddleware = [protect, ifExists(config.EXIST_OPTIONS), validate(config.VALIDATORS.POST)];
const updateMiddleware = [
	protect,
	ifExists(config.EXIST_OPTIONS),
	validate(config.VALIDATORS.UPDATE),
];

const countMiddleware = [protect, query(config.FILTER_OPTIONS)];

// Define the routes for the product store
router
	.route('/')
	.get(...commonMiddleware, hasPermission(['view_product']), getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, hasPermission(['add_product']), createDocument(config.MODEL));

router.get(
	'/top-selling',
	protect,
	sort,
	query(topProductConfig.FILTER_OPTIONS),
	hasPermission(['view_product']),
	topSellingProductController
);

router.get('/:id', protect, hasPermission(['view_product']), getDocumentById(config.QUERY_OPTIONS));

router.get(
	'/edit/:id',
	protect,
	hasPermission(['view_product']),
	getDocumentToEditById(config.MODEL)
);

router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
// router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
router.get('/top-selling/get/filters', protect, getFilters(topProductConfig.FILTER_LIST));

router.put(
	'/:id',
	...updateMiddleware,
	hasPermission(['edit_product']),
	updateDocument(config.EDITS)
);
router.delete('/:id', protect, hasPermission(['delete_product']), deleteDocument(config.MODEL));
router.get('/get/count', protect, getCount(config.MODEL));

router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

router.put(
	'/update/many',
	protect,
	hasPermission(['edit_product']),
	updateManyDocuments(config.EDITS)
);
router.put('/copy/:id', protect, duplicateDocument(config.DUPLICATE_OPTIONS));

router.put('/:id/cancel', protect, cancelOrder);
router.get('/get/sum/:field', ...countMiddleware, getInventoryCount(config.MODEL));

// Export the router
export default router;
