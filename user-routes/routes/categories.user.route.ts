// Import necessary modules from their respective files
import express from 'express';
import sort from '../../middleware/pagination.middleware.js';
import query from '../../middleware/filter.middleware.js';
import getDocumentById from '../../controllers/common/getDocumentById.controller.js';
import Category from '../../models/category/category.model.js';
import settings from '../../models/category/category.settings.js';
import getAllDocuments from '../../controllers/common/getAllDocuments.controller.js';
import validate from '../../middleware/validate.middleware.js';
import constructConfig from '../../lib/configurator/constructConfig.js';
import { protect } from '../../middleware/auth.middleware.js';
import getCount from '../../controllers/common/getCount.controller.js';

import hasPermission from '../../middleware/hasPermission.middleware.js';
import { shop } from '../../middleware/userAuth.middleware.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Category,
	config: settings,
});

// Define common middleware
const postMiddleware = [protect, validate(config.VALIDATORS.POST), hasPermission(['add_category'])];

const commonMiddleware = [
	// protect,
	sort,
	shop,
	query(config.FILTER_OPTIONS),
	// hasPermission(['view_category']),
];
const updateMiddleware = [
	protect,
	validate(config.VALIDATORS.UPDATE),
	hasPermission(['edit_category']),
];

// Define the routes for the product store
router.route('/').get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS));
// .post(...postMiddleware, createDocument(config.MODEL));
router.get('/:id', getDocumentById(config.QUERY_OPTIONS));
router.get('/get/count', shop, getCount(config.MODEL));
//router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
// router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
// router.delete('/:id', protect, hasPermission(['delete_category']), deleteDocument(config.MODEL));

// router.post(
// 	'/export/csv',
// 	protect,
// 	exportDocument({ model: config.MODEL, populate: config.POPULATE })
// );

// router.put(
// 	'/update/many',
// 	protect,
// 	hasPermission(['edit_category']),
// 	updateManyDocuments(config.EDITS)
// );
// router.put(
// 	'/copy/:id',
// 	protect,
// 	hasPermission(['add_category']),
// 	duplicateDocument({ model: config.MODEL })
// );

// router.get('/edit/:id', protect, getDocumentToEditById(config.MODEL));

// Export the router
export default router;
