// Import necessary modules from their respective files
import express from 'express';
// import { Product as Model, productSettings as settings } from '../../models/index.js';
import {
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
	getSum,
	getSchema,
	deleteDocument,
} from '../../controllers/index.js';

import {
	adminProtect as protect,
	validate,
	paginate,
	filter,
	adminPermissions as hasPermission,
	ifExists,
} from '../../middleware/index.js';
import { constructPermissions, constructConfig, SettingsType } from '../../imports.js';
import mongoose from 'mongoose';
import createDocument from '../../admin-controllers/common/createDocument.controller.js';

// Define the permissions
// const permission = 'product';

// Initialize a new router
type RouteOptions = {
	Model: mongoose.Model<any>;
	settings: SettingsType<any>;
	permission: string;
};

const defineRoutes = ({ Model, settings, permission }: RouteOptions) => {
	const router = express.Router();
	// Construct configuration and permissions
	const config = constructConfig({
		model: Model,
		config: settings,
		options: { role: 'admin' },
	});

	const permissions = constructPermissions(permission);

	//Define the middlewares
	const middlewares = {
		//Middleware for creating a new category
		post: [
			protect,
			validate(config.VALIDATORS.POST),
			ifExists(config.EXIST_OPTIONS),
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

	//GENERIC_ROUTES
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

	//Find to edit
	router.get('/edit/:id', ...middlewares.getById, getDocumentToEditById(config.MODEL));

	//Update Manu
	router.put('/update/many', ...middlewares.updateMany, updateManyDocuments(config.EDITS));

	//get Filters & count & schema
	router.get('/get/filters', ...middlewares.filter, getFilters(config.FILTER_LIST));
	router.get('/get/count', ...middlewares.count, getCount(config.MODEL));
	router.get('/get/schema', getSchema(config.SCHEMA));

	//Export as CSV and PDF
	router.post('/export/csv', ...middlewares.export, exportCsv(config.EXPORT_OPTIONS));
	router.post('/export/pdf', ...middlewares.export, exportPdf(config.EXPORT_OPTIONS));

	//Duplicate
	router.put('/copy/:id', ...middlewares.copy, duplicateDocument({ model: config.MODEL }));

	//Count/Sum Aggregations
	router.get('/get/count', ...middlewares.count, getCount(config.MODEL));
	router.get('/get/sum/:field', ...middlewares.count, getSum(config.MODEL));

	return router;
};

// Export the router
export default defineRoutes;
