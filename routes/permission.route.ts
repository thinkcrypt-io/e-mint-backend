// Import necessary modules from their respective files
import express from 'express';
import constructConfig from '../lib/configurator/constructConfig.js';
//import { data } from '../models/role/permissions.js';

import { protect, sort, query, validate, ifExists } from '../middleware/index.js';
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

import Order, { settings } from '../models/order/order.model.js';
import getOrderTotal from '../controllers/order/getOrderTotal.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Order,
	config: settings,
});

const getAllPermissions = async (req: any, res: any): Promise<any> => {
	const data = ['product', 'category', 'brand', 'order', 'user', 'role', 'customer', 'collection'];
	try {
		let result: any[] = [];
		data.forEach((item: any) => {
			const newPermission = [
				{
					name: `Add ${item}`,
					_id: `add_${item}`,
				},
				{
					name: `View ${item}`,
					_id: `view_${item}`,
				},
				{
					name: `Edit ${item}`,
					_id: `edit_${item}`,
				},
				{
					name: `Delete ${item}`,
					_id: `delete_${item}`,
				},
			];
			const newResult = [...result, ...newPermission];
			result = newResult;
		});

		const count: number = result.length;

		// req.meta.docsInPage = 100;
		// req.meta.totalDocs = count;
		// req.meta.totalPages = Math.ceil(count / 16);

		return res.status(200).json({ doc: result });
	} catch (error: any) {
		return res.status(500).json({ error: error.message });
	}
};

// Define common middleware
const commonMiddleware = [protect, sort, query(config.FILTER_OPTIONS)];
const postMiddleware = [protect, ifExists(config.EXIST_OPTIONS), validate(config.VALIDATORS.POST)];
const updateMiddleware = [protect, validate(config.VALIDATORS.UPDATE)];

// Define the routes for the product store
router.route('/').get(getAllPermissions);
// .post(...postMiddleware, createDocument(config.MODEL));

// router.get('/:id', protect, getDocumentById(config.QUERY_OPTIONS));

// router.get('/edit/:id', protect, getDocumentToEditById(config.MODEL));

// router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
// router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
// router.delete('/:id', protect, deleteDocument(config.MODEL));
// router.get('/get/count', protect, getCount(config.MODEL));

// router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

// router.put('/update/many', protect, updateManyDocuments(config.EDITS));
// router.put('/copy/:id', protect, duplicateDocument(config.DUPLICATE_OPTIONS));

// Export the router
export default router;
