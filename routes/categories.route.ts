// Import necessary modules from their respective files
import express from 'express';
import { Category as Model, categorySettings as settings } from '../models/index.js';
import {
	deleteDocument,
	createDocument,
	updateDocument,
	getAllDocuments,
	getDocumentById,
	getDocumentToEditById,
	duplicateDocument,
	exportDocument,
	updateManyDocuments,
	exportPdf,
	getCount,
	getFilters,
} from '../controllers/index.js';

import { isExpired, hasPermission, protect, query, sort, validate } from '../middleware/index.js';
import { constructPermissions, constructConfig } from '../imports.js';

const permission = 'category';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Model,
	config: settings,
});

const permissions = constructPermissions(permission);

const middlewares = {
	post: [protect, validate(config.VALIDATORS.POST), hasPermission([permissions.create])],
	getAll: [protect, sort, query(config.FILTER_OPTIONS), hasPermission([permissions.read])],
	update: [protect, validate(config.VALIDATORS.UPDATE), hasPermission([permissions.update])],
	updateMany: [protect, hasPermission([permissions.update])],
	getById: [protect, hasPermission([permissions.read])],
	delete: [protect, hasPermission([permissions.delete])],
	copy: [protect, hasPermission([permissions.create])],
	count: [protect],
	export: [protect],
};

// Define the routes for the product store
router
	.route('/')
	.get(...middlewares.getAll, getAllDocuments(config.QUERY_OPTIONS))
	.post(...middlewares.post, createDocument(config.MODEL));

router
	.route('/:id')
	.get(...middlewares.getById, getDocumentById(config.QUERY_OPTIONS))
	.put(...middlewares.update, updateDocument(config.EDITS))
	.delete(...middlewares.delete, deleteDocument(config.MODEL));

router.put('/update/many', ...middlewares.updateMany, updateManyDocuments(config.EDITS));

router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
router.get('/get/count', ...middlewares.count, getCount(config.MODEL));

router.post('/export/csv', ...middlewares.export, exportDocument(config.EXPORT_OPTIONS));
router.post('/export/pdf', ...middlewares.export, exportPdf(config.EXPORT_OPTIONS));

router.put('/copy/:id', ...middlewares.copy, duplicateDocument({ model: config.MODEL }));
router.get('/edit/:id', ...middlewares.getById, getDocumentToEditById(config.MODEL));

// Export the router
export default router;
