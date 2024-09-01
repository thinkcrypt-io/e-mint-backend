// Import necessary modules from their respective files
import express from 'express';
import sort from '../middleware/pagination.middleware.js';
import query from '../middleware/filter.middleware.js';
import getDocumentById from '../controllers/common/getDocumentById.controller.js';
import Category, { settings } from '../models/category/category.model.js';
import getAllDocuments from '../controllers/common/getAllDocuments.controller.js';
import updateDocument from '../controllers/common/updateDocument.controller.js';
import validate from '../middleware/validate.middleware.js';
import ifExists from '../middleware/isExists.middleware.js';
import createDocument from '../controllers/common/createDocument.controller.js';
import getFilters from '../controllers/common/getFilters.controller.js';
import deleteDocument from '../controllers/common/deleteDocument.controller.js';
import constructConfig from '../lib/configurator/constructConfig.js';
import { protect } from '../middleware/auth.middleware.js';
import getCount from '../controllers/common/getCount.controller.js';
import exportDocument from '../controllers/common/exportDocument.controller.js';
import updateManyDocuments from '../controllers/common/updateManyDocuments.controller.js';
import duplicateDocument from '../controllers/common/duplicateDocument.controller.js';
import getDocumentToEditById from '../controllers/common/getDocumentToEditById.controller.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Category,
	config: settings,
});

// Define common middleware
const postMiddleware = [protect, validate(config.VALIDATORS.POST)];

const commonMiddleware = [protect, sort, query(config.FILTER_OPTIONS)];
const updateMiddleware = [protect, validate(config.VALIDATORS.UPDATE)];

// Define the routes for the product store
router
	.route('/')
	.get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, createDocument(config.MODEL));
router.get('/:id', protect, getDocumentById(config.QUERY_OPTIONS));
router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
router.delete('/:id', protect, deleteDocument(config.MODEL));
router.get('/get/count', protect, getCount(config.MODEL));
router.post(
	'/export/csv',
	protect,
	exportDocument({ model: config.MODEL, populate: config.POPULATE })
);

router.put('/update/many', protect, updateManyDocuments(config.EDITS));
router.put('/copy/:id', protect, duplicateDocument({ model: config.MODEL }));

router.get('/edit/:id', protect, getDocumentToEditById(config.MODEL));

// Export the router
export default router;
