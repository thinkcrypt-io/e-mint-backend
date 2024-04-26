// Import necessary modules from their respective files
import express from 'express';
import sort from '../middleware/pagination.middleware.js';
import query from '../middleware/filter.middleware.js';
import getDocumentById from '../controllers/common/getDocumentById.controller.js';
import Leave, { settings } from '../models/leave/leave.model.js';
import getAllDocuments from '../controllers/common/getAllDocuments.controller.js';
import updateDocument from '../controllers/common/updateDocument.controller.js';
import validate from '../middleware/validate.middleware.js';
import ifExists from '../middleware/isExists.middleware.js';
import createDocument from '../controllers/common/createDocument.controller.js';
import getFilters from '../controllers/common/getFilters.controller.js';
import deleteDocument from '../controllers/common/deleteDocument.controller.js';
import constructConfig from '../lib/configurator/constructConfig.js';
import { admin } from '../middleware/auth.middleware.js';
import createLeave from '../controllers/leave/createLeave.controller.js';
import updateLeave from '../controllers/leave/updateLeave.controller.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Leave,
	config: settings,
});

// Define common middleware
const commonMiddleware = [sort, query(config.FILTER_OPTIONS)];
const postMiddleware = [validate(config.VALIDATORS.POST)];
const updateMiddleware = [admin, validate(config.VALIDATORS.UPDATE)];

// Define the routes for the product store
router
	.route('/')
	.get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, createLeave);
router.get('/:id', admin, getDocumentById(config.QUERY_OPTIONS));
router.get('/get/filters', admin, getFilters(config.FILTER_LIST));
router.put('/:id', ...updateMiddleware, updateLeave);
router.delete('/:id', admin, deleteDocument(config.MODEL));

// Export the router
export default router;
