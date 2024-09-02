// Import necessary modules from their respective files
import express from 'express';
import sort from '../middleware/pagination.middleware.js';
import query from '../middleware/filter.middleware.js';
import getDocumentById from '../controllers/common/getDocumentById.controller.js';
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

import Customer, { settings } from '../models/user/user.model.js';
import ifExistOnUpdate from '../middleware/ifExistOnUpdate.middleware.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Customer,
	config: settings,
});

// Define common middleware
const commonMiddleware = [protect, sort, query(config.FILTER_OPTIONS)];
const postMiddleware = [protect, ifExists(config.EXIST_OPTIONS), validate(config.VALIDATORS.POST)];
const updateMiddleware = [
	protect,
	ifExistOnUpdate(config.EXIST_OPTIONS),
	validate(config.VALIDATORS.UPDATE),
];

// Define the routes for the product store
router
	.route('/')
	.get(
		...commonMiddleware,
		getAllDocuments({ ...config.QUERY_OPTIONS, exclude: '-password -phone' })
	)
	.post(...postMiddleware, createDocument(config.MODEL));

router.get('/:id', protect, getDocumentById(config.QUERY_OPTIONS));

router.get('/edit/:id', protect, getDocumentToEditById(config.MODEL));

router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
router.delete('/:id', protect, deleteDocument(config.MODEL));
router.get('/get/count', protect, getCount(config.MODEL));

router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

router.put('/update/many', protect, updateManyDocuments(config.EDITS));
router.put('/copy/:id', protect, duplicateDocument({ model: config.MODEL }));

// Export the router
export default router;
