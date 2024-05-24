// Import necessary modules from their respective files
import express from 'express';
import sort from '../middleware/pagination.middleware.js';
import query from '../middleware/filter.middleware.js';
import getDocumentById from '../controllers/common/getDocumentById.controller.js';
import getAllDocuments from '../controllers/common/getAllDocuments.controller.js';
import updateDocument from '../controllers/common/updateDocument.controller.js';
import validate from '../middleware/validate.middleware.js';
import createDocument from '../controllers/common/createDocument.controller.js';
import getFilters from '../controllers/common/getFilters.controller.js';
import deleteDocument from '../controllers/common/deleteDocument.controller.js';
import constructConfig from '../lib/configurator/constructConfig.js';
import { protect } from '../middleware/auth.middleware.js';
import QR from '../models/qr/qr.model.js';
import getCount from '../controllers/common/getCount.controller.js';
import createOrUpdateDocument from '../controllers/common/createOrUpdateDocument.controller.js';
import getOneDocument from '../controllers/common/getOneDocument.controller.js';

// Initialize a new router
const router = express.Router();

// const config = constructConfig({
// 	model: QR,
// 	config: settings,
// });

// Define common middleware
//const commonMiddleware = [protect, sort, query(config.FILTER_OPTIONS)];
const postMiddleware = [protect];
const findMiddleware = [
	protect,
	(req: any, res: any, next: any) => {
		req.queryHelper = { ...req.queryHelper, restaurant: req.user.restaurant };
		next();
	},
];
// const updateMiddleware = [protect, validate(config.VALIDATORS.UPDATE)];

// Define the routes for the product store
router
	.route('/')
	// 	.get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, createOrUpdateDocument(QR));
router.get('/:id', findMiddleware, getOneDocument({ model: QR }));
// router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
// router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
// router.delete('/:id', protect, deleteDocument(config.MODEL));
// router.get('/get/count', protect, getCount(config.MODEL));

// Export the router
export default router;
