// Import necessary modules from their respective files
import express from 'express';

import {
	constructConfig,
	hasPermission,
	ifExists,
	validate,
	query,
	sort,
	getDocumentById,
	getAllDocuments,
	updateDocument,
	createDocument,
	getFilters,
	deleteDocument,
	getCount,
	protect,
	exportDocument,
	updateManyDocuments,
	duplicateDocument,
	getDocumentToEditById,
	constructPermissions,
} from '@/imports.js';
import Expense, { settings } from '@/models/expense/expense.model';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Expense,
	config: settings,
});

const permissions = constructPermissions('expenses');

// Define common middleware
const postMiddleware = [
	protect,
	validate(config.VALIDATORS.POST),
	hasPermission([permissions.create]),
];

const copyMiddleware = [protect, hasPermission([permissions.create])];

const commonMiddleware = [
	protect,
	sort,
	query(config.FILTER_OPTIONS),
	hasPermission([permissions.read]),
];
const updateMiddleware = [
	protect,
	validate(config.VALIDATORS.UPDATE),
	hasPermission([permissions.update]),
];

const exportMiddleware = [protect, hasPermission([permissions.read])];
const countMiddleware = [protect];
const deleteMiddleware = [protect, hasPermission([permissions.delete])];
const getByIdMiddleware = [protect, hasPermission([permissions.view])];

// Define the routes for the product store
router
	.route('/')
	.get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, createDocument(config.MODEL));

router
	.route('/:id')
	.get(...getByIdMiddleware, getDocumentById(config.QUERY_OPTIONS))
	.put(...updateMiddleware, updateDocument(config.EDITS))
	.delete(...deleteMiddleware, deleteDocument(config.MODEL));

router.get('/get/filters', getFilters(config.FILTER_LIST));
router.get('/get/count', ...countMiddleware, getCount(config.MODEL));
router.post(
	'/export/csv',
	...exportMiddleware,
	exportDocument({ model: config.MODEL, populate: config.POPULATE })
);

router.put('/update/many', ...updateMiddleware, updateManyDocuments(config.EDITS));
router.put('/copy/:id', ...copyMiddleware, duplicateDocument({ model: config.MODEL }));
router.get('/edit/:id', ...getByIdMiddleware, getDocumentToEditById(config.MODEL));

// Export the router
export default router;
