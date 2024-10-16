// Import necessary modules from their respective files
import express from 'express';

import {
	constructConfig,
	adminPermissions as hasPermission,
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
	exportDocument,
	updateManyDocuments,
	duplicateDocument,
	getDocumentToEditById,
	constructPermissions,
	getSum,
	adminProtect as protect,
	exportPdf,
} from '../../imports.js';
import Model, { settings } from '../../models/shop/shop.model.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Model,
	config: settings,
	options: { role: 'admin' },
});

const permissions = constructPermissions('shop');

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
const countMiddleware = [protect, query(config.FILTER_OPTIONS)];
const deleteMiddleware = [protect, hasPermission([permissions.delete])];
const getByIdMiddleware = [protect, hasPermission([permissions.view])];

// Define the routes for the product store
router.route('/').get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS));
// .post(...postMiddleware, createDocument(config.MODEL));

router
	.route('/:id')
	.get(...getByIdMiddleware, getDocumentById(config.QUERY_OPTIONS))
	.put(...updateMiddleware, updateDocument(config.EDITS));
// .delete(...deleteMiddleware, deleteDocument(config.MODEL));
router.put('/update/many', ...updateMiddleware, updateManyDocuments(config.EDITS));
router.get('/edit/:id', ...getByIdMiddleware, getDocumentToEditById(config.MODEL));

//Count/Sum Aggregations
router.get('/get/count', ...countMiddleware, getCount(config.MODEL));
router.get('/get/sum/:field', ...countMiddleware, getSum(config.MODEL));

//Get Filters
router.get('/get/filters', getFilters(config.FILTER_LIST));

//Export Documents
router.post('/export/csv', ...exportMiddleware, exportDocument(config.QUERY_OPTIONS));
router.post('/export/pdf', ...exportMiddleware, exportPdf(config.QUERY_OPTIONS));

// router.put('/copy/:id', ...copyMiddleware, duplicateDocument({ model: config.MODEL }));

// Export the router
export default router;
