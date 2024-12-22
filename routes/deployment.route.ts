// Import necessary modules from their respective files
import express from 'express';
import { Deployment as Model, deploymentSettings as settings } from '../models/index.js';
import {
	deleteDocument,
	createDocument,
	updateDocument,
	getAllDocuments,
	getDocumentById,
	getDocumentToEditById,
	duplicateDocument,
	exportCsv,
	updateManyDocuments,
	exportPdf,
	getCount,
	getFilters,
} from '../controllers/index.js';

import {
	hasPermission,
	protect,
	validate,
	paginate,
	filter,
	isExists,
} from '../middleware/index.js';
import { constructPermissions, constructConfig, getOneDocument } from '../imports.js';
import deleteProject from '../controllers/hongo/deleteProject.controller.js';
import getDeploymentStatus from '../controllers/hongo/getDeploymentStatus.js';

// Define the permissions
const permission = 'category';

// Initialize a new router
const router = express.Router();

// Construct configuration and permissions
const config = constructConfig({
	model: Model,
	config: settings,
});
const permissions = constructPermissions(permission);

//Define the middlewares
const middlewares = {
	//Middleware for creating a new category
	post: [
		protect,
		validate(config.VALIDATORS.POST),
		isExists(config.EXIST_OPTIONS),
		hasPermission([permissions.create]),
	],
	//Middleware for getting all categories
	getAll: [protect, paginate, filter(config.FILTER_OPTIONS), hasPermission([permissions.read])],
	//Middleware for updating a category
	update: [protect, validate(config.VALIDATORS.UPDATE), hasPermission([permissions.update])],
	//Middleware for updating many categories
	updateMany: [protect, hasPermission([permissions.update])],
	//Middleware for getting a category by ID
	getById: [protect, hasPermission([permissions.read])],
	//Middleware for deleting a category
	delete: [protect, hasPermission([permissions.delete])],
	//Middleware for copying a category
	copy: [protect, hasPermission([permissions.create])],
	// Middleware for getting the count of categories
	count: [protect],
	// Middleware for exporting category data
	export: [protect],
	// Middleware for filtering documents
	filter: [protect],
};

// Define the routes
router
	.route('/')
	.get(...middlewares.getAll, getAllDocuments(config.QUERY_OPTIONS))
	.post(...middlewares.post, createDocument(config.MODEL));

//:id is a dynamic parameter that will be extracted from the URL
router
	.route('/:id')
	.get(...middlewares.getById, getDocumentById(config.QUERY_OPTIONS))
	.put(...middlewares.update, updateDocument(config.EDITS))
	.delete(...middlewares.delete, deleteDocument(config.MODEL));

//

//Find to edit
router.get('/edit/:id', ...middlewares.getById, getDocumentToEditById(config.MODEL));

//Update Manu
router.put('/update/many', ...middlewares.updateMany, updateManyDocuments(config.EDITS));

//get Filters & count
router.get('/get/filters', ...middlewares.filter, getFilters(config.FILTER_LIST));
router.get('/get/count', ...middlewares.count, getCount(config.MODEL));

//Export as CSV and PDF
router.post('/export/csv', ...middlewares.export, exportCsv(config.EXPORT_OPTIONS));
router.post('/export/pdf', ...middlewares.export, exportPdf(config.EXPORT_OPTIONS));

//Duplicate
router.put('/copy/:id', ...middlewares.copy, duplicateDocument({ model: config.MODEL }));

//Get One
router.get('/get/one', ...middlewares.getById, getOneDocument(config.QUERY_OPTIONS));
router.get('/status/:id', getDeploymentStatus);

//Extra Routes
router.post('/delete', ...middlewares.delete, deleteProject);

// Export the router
export default router;
