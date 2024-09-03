// Import necessary modules from their respective files
import express from 'express';
import constructConfig from '../lib/configurator/constructConfig.js';

import { protect, sort, query, validate, ifExists, hasPermission } from '../middleware/index.js';
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
	createDocument,
} from '../controllers/common/index.js';

import Role, { settings } from '../models/role/role.model.js';
import getOrderTotal from '../controllers/order/getOrderTotal.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Role,
	config: settings,
});

// Define common middleware
const commonMiddleware = [
	protect,
	hasPermission(['view_role']),
	sort,
	query(config.FILTER_OPTIONS),
];
const postMiddleware = [
	protect,
	ifExists(config.EXIST_OPTIONS),
	validate(config.VALIDATORS.POST),
	hasPermission(['add_role']),
];
const updateMiddleware = [
	protect,
	hasPermission(['edit_role']),
	validate(config.VALIDATORS.UPDATE),
];

// Define the routes for the product store
router
	.route('/')
	.get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, createDocument(config.MODEL));

router.get('/:id', protect, hasPermission(['view_role']), getDocumentById(config.QUERY_OPTIONS));

router.get('/edit/:id', protect, hasPermission(['view_role']), getDocumentToEditById(config.MODEL));

router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
router.delete('/:id', protect, hasPermission(['delete_role']), deleteDocument(config.MODEL));
router.get('/get/count', protect, getCount(config.MODEL));

router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

router.put(
	'/update/many',
	protect,
	hasPermission(['edit_role']),
	updateManyDocuments(config.EDITS)
);
router.put(
	'/copy/:id',
	protect,
	hasPermission(['add_role']),
	duplicateDocument(config.DUPLICATE_OPTIONS)
);

// Export the router
export default router;
