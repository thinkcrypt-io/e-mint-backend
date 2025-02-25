// Import necessary modules from their respective files
import express from 'express';
// import { Product as Model, productSettings as settings } from '../../models/index.js';
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
	getSchema,
	getSum,
} from '../../controllers/index.js';

import {
	protect,
	validate,
	paginate,
	filter,
	hasPermission,
	ifExists,
	isExpired,
} from '../../middleware/index.js';
import { constructPermissions, constructConfig, SettingsType } from '../../imports.js';
import mongoose from 'mongoose';

// Define the permissions
// const permission = 'product';

type ControllerOptions = {
	post?: any;
	getAll?: any;
	update?: any;
	updateMany?: any;
	getById?: any;
	delete?: any;
	copy?: any;
	count?: any;
	sum?: any;
	export?: any;
	filter?: any;
	schema?: any;
};

// Initialize a new router
type RouteOptions = {
	Model: mongoose.Model<any>;
	settings: SettingsType<any>;
	permission: string;
	injectMiddleware?: ControllerOptions;
	replaceController?: ControllerOptions;
};

/**
 * commonRouter function
 *
 * This function sets up a generic Express router with CRUD routes and additional operations.
 * It uses injected middleware and controller functions to handle operations such as creating,
 * updating, deleting, fetching, exporting, and aggregating documents.
 *
 * @param {RouteOptions} options - The configuration options for the router.
 * @returns {express.Router} - An Express router with the configured routes.
 */

const commonRouter = ({
	Model,
	settings,
	permission,
	injectMiddleware,
	replaceController,
}: RouteOptions) => {
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
			isExpired,
			validate(config.VALIDATORS.POST),
			ifExists(config.EXIST_OPTIONS),
			hasPermission([permissions.create]),
			...(injectMiddleware?.post || []),
		],
		//Middleware for getting all categories
		getAll: [
			protect,
			paginate,
			filter(config.FILTER_OPTIONS),
			hasPermission([permissions.read]),
			...(injectMiddleware?.getAll || []),
		],
		//Middleware for updating a category
		update: [
			protect,
			isExpired,
			validate(config.VALIDATORS.UPDATE),
			hasPermission([permissions.update]),
			...(injectMiddleware?.update || []),
		],
		//Middleware for updating many categories
		updateMany: [
			protect,
			isExpired,
			hasPermission([permissions.update]),
			...(injectMiddleware?.updateMany || []),
		],
		//Middleware for getting a category by ID
		getById: [protect, hasPermission([permissions.read]), ...(injectMiddleware?.getById || [])],
		//Middleware for deleting a category
		delete: [protect, hasPermission([permissions.delete]), ...(injectMiddleware?.delete || [])],
		//Middleware for copying a category
		copy: [protect, hasPermission([permissions.create]), ...(injectMiddleware?.copy || [])],
		// Middleware for getting the count of categories
		count: [protect, ...(injectMiddleware?.count || [])],
		// Middleware for getting the sum
		sum: [protect, ...(injectMiddleware?.count || [])],
		// Middleware for exporting category data
		export: [protect, ...(injectMiddleware?.export || [])],
		// Middleware for filtering documents
		filter: [protect, ...(injectMiddleware?.filter || [])],
	};

	//GENERIC_ROUTES
	// Define the routes
	router
		.route('/')
		.get(...middlewares.getAll, replaceController?.getAll || getAllDocuments(config.QUERY_OPTIONS))
		.post(...middlewares.post, replaceController?.post || createDocument(config.MODEL));

	//:id is a dynamic parameter that will be extracted from the URL
	router
		.route('/:id')
		.get(
			...middlewares.getById,
			replaceController?.getById || getDocumentById(config.QUERY_OPTIONS)
		)
		.put(...middlewares.update, replaceController?.update || updateDocument(config.EDITS))
		.delete(...middlewares.delete, replaceController?.delete || deleteDocument(config.MODEL));

	//Find to edit
	router.get(
		'/edit/:id',
		...middlewares.getById,
		replaceController?.update || getDocumentToEditById(config.MODEL)
	);

	//Update Manu
	router.put(
		'/update/many',
		...middlewares.updateMany,
		replaceController?.updateMany || updateManyDocuments(config.EDITS)
	);

	//get Filters & count & schema
	router.get(
		'/get/filters',
		...middlewares.filter,
		replaceController?.filter || getFilters(config.FILTER_LIST)
	);
	router.get('/get/schema', replaceController?.schema || getSchema(config.SCHEMA));

	//Export as CSV and PDF
	router.post(
		'/export/csv',
		...middlewares.export,
		replaceController?.export || exportCsv(config.EXPORT_OPTIONS)
	);
	router.post(
		'/export/pdf',
		...middlewares.export,
		replaceController?.export || exportPdf(config.EXPORT_OPTIONS)
	);

	//Duplicate
	router.put(
		'/copy/:id',
		...middlewares.copy,
		replaceController?.copy || duplicateDocument({ model: config.MODEL })
	);

	//Count/Sum Aggregations
	router.get(
		'/get/count',
		...middlewares.count,
		replaceController?.count || getCount(config.MODEL)
	);
	router.get('/get/sum/:field', ...middlewares.sum, replaceController?.sum || getSum(config.MODEL));

	return router;
};

// Export the router
export default commonRouter;
