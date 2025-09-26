import express from 'express';
import mongoose from 'mongoose';

import {
	updateDocument,
	getAllDocuments,
	getDocumentById,
	getDocumentToEditById,
	deleteDocument,
	createDocument,
	getDocumentBySlug,
	getDocumentByCode,
} from '../controllers/crud/_index.js';

import { updateManyDocuments } from '../controllers/bulk/_index.js';

import { getSchema, getConfig, getPageRoute } from '../controllers/config/_index.js';
import { exportPdf, exportCsv } from '../controllers/export/_index.js';

import { constructPermissions, constructConfig } from '../configurator/_index.js';
import { SettingsType } from '../types/_index.js';
import { getSum, getCount } from '../controllers/aggregate/_index.js';

import {
	duplicateDocument,
	getDistinctFields,
	getFilters,
} from '../controllers/queryhelper/_index.js';

import {
	adminPermissions as hasPermission,
	adminProtect as protect,
	validate,
	paginate,
	filter,
	ifExists,
} from '../middlewares/_index.js';

// Define the permissions
// const permission = 'product';

type ControllerOptions = {
	post?: any;
	getAll?: any;
	update?: any;
	updateMany?: any;
	getById?: any;
	getByCode?: any;
	getBySlug?: any;
	delete?: any;
	copy?: any;
	count?: any;
	sum?: any;
	export?: any;
	filter?: any;
	schema?: any;
	config?: any;
	distinct?: any;
};

// Enhanced types for dynamic routes
type CustomRoute = {
	path: string;
	method: 'get' | 'post' | 'put' | 'delete' | 'patch';
	controller: any;
	middlewares?: any[];
	description?: string;
};

// Initialize a new router
type RouteOptions = {
	Model: mongoose.Model<any>;
	settings: SettingsType<any>;
	permission: string;
	injectMiddleware?: ControllerOptions;
	replaceController?: ControllerOptions;
	frontendConfig?: any;
	customRoutes?: CustomRoute[];
	route?: string; // Optional route name for frontend configuration
};

const defineRoutes = ({
	Model,
	settings,
	permission,
	injectMiddleware,
	replaceController,
	frontendConfig,
	route,
	customRoutes = [], // Default to empty array
}: RouteOptions) => {
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
			validate(config.VALIDATORS.UPDATE),
			hasPermission([permissions.update]),
			...(injectMiddleware?.update || []),
		],
		//Middleware for updating many categories
		updateMany: [
			protect,
			hasPermission([permissions.update]),
			...(injectMiddleware?.updateMany || []),
		],
		//Middleware for getting a category by ID
		getById: [protect, hasPermission([permissions.read]), ...(injectMiddleware?.getById || [])],
		//Middleware for getting a category by ID
		getByCode: [protect, hasPermission([permissions.read]), ...(injectMiddleware?.getByCode || [])],
		//Middleware for getting a category to edit by ID
		getBySlug: [protect, hasPermission([permissions.read]), ...(injectMiddleware?.getBySlug || [])],
		//Middleware for deleting a category
		delete: [protect, hasPermission([permissions.delete]), ...(injectMiddleware?.delete || [])],
		//Middleware for copying a category
		copy: [protect, hasPermission([permissions.create]), ...(injectMiddleware?.copy || [])],
		// Middleware for getting the count of categories
		count: [protect, ...(injectMiddleware?.count || [])],
		// Middleware for exporting category data
		export: [protect, filter(config.FILTER_OPTIONS), ...(injectMiddleware?.export || [])],
		// Middleware for filtering documents
		filter: [protect, ...(injectMiddleware?.filter || [])],
		distinct: [protect, filter(config.FILTER_OPTIONS), ...(injectMiddleware?.distinct || [])],
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

	//:code is a dynamic parameter that will be extracted from the URL
	router
		.route('/g/code/:code')
		.get(
			...middlewares.getByCode,
			replaceController?.getByCode || getDocumentByCode(config.QUERY_OPTIONS)
		);

	//:id is a dynamic parameter that will be extracted from the URL
	router
		.route('/g/id/:id')
		.get(
			...middlewares.getById,
			replaceController?.getById || getDocumentById(config.QUERY_OPTIONS)
		);

	//:id is a dynamic parameter that will be extracted from the URL
	router
		.route('/g/slug/:slug')
		.get(
			...middlewares.getBySlug,
			replaceController?.getBySlug || getDocumentBySlug(config.QUERY_OPTIONS)
		);

	//Find to edit
	router.get(
		'/edit/:id',
		...middlewares.getById,
		replaceController?.getById || getDocumentToEditById(config.MODEL)
	);

	//Update Many
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
	router.get(
		'/get/count',
		...middlewares.count,
		replaceController?.count || getCount(config.MODEL)
	);
	router.get('/get/schema', replaceController?.schema || getSchema(config.SCHEMA));
	frontendConfig &&
		router.get(
			'/get/config',
			replaceController?.config ||
				getConfig({ config: frontendConfig, schema: config.SCHEMA, route })
		);

	frontendConfig &&
		router.get(
			'/get/route',
			replaceController?.config || getPageRoute({ config: frontendConfig, route })
		);

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
		'/get/sum/:field',
		...middlewares.count,
		replaceController?.sum || getSum(config.MODEL)
	);

	//Get distinct values for a field
	router.get(
		'/get/distinct/:key',
		...middlewares.distinct,
		replaceController?.distinct || getDistinctFields({ model: config.MODEL })
	);

	customRoutes.forEach((customRoute: CustomRoute) => {
		const {
			path,
			method,
			controller,
			middlewares: customMiddlewares = [],
			description,
		} = customRoute;

		const fullPath = path;

		// Log route registration for debugging
		console.log(
			`📍 Registering custom route: ${method.toUpperCase()} ${fullPath}${description ? ` - ${description}` : ''}`
		);

		// Determine middlewares to apply
		let routeMiddlewares = [];

		// if (!skipDefaultMiddlewares) {
		// 	// Apply basic protection if not skipped
		// 	routeMiddlewares.push(protect);
		// }

		// Add custom middlewares
		routeMiddlewares.push(...customMiddlewares);

		// Register the route based on HTTP method
		switch (method) {
			case 'get':
				router.get(fullPath, ...routeMiddlewares, controller);
				break;
			case 'post':
				router.post(fullPath, ...routeMiddlewares, controller);
				break;
			case 'put':
				router.put(fullPath, ...routeMiddlewares, controller);
				break;
			case 'delete':
				router.delete(fullPath, ...routeMiddlewares, controller);
				break;
			case 'patch':
				router.patch(fullPath, ...routeMiddlewares, controller);
				break;
			default:
				console.warn(`⚠️ Unsupported HTTP method: ${method} for route: ${fullPath}`);
		}
	});

	return router;
};

// Export the router
export default defineRoutes;
