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
	getDocumentByCode,
	getDocumentBySlug,
	getDistinctFields,
	getPageRoute,
} from '../../controllers/index.js';

import { getConfig } from '../../library/controllers/index.js';

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
import getViewDocument from '../../library/controllers/builder/viewDocument.controller.js';
import {
	resolveRoute,
	resourceRouteKey,
	ResolvedRoute,
} from '../../library/functions/resolveRoute.function.js';

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

	// Read by collectResourceRoutes: the code a route was built from, which the
	// builder seeds into RouteSettings / RouteConfig and falls back to.
	(router as any).routeSource = { Model, settings, frontendConfig, permission, route };

	// Every request first resolves what this route runs on — the published
	// RouteSettings / RouteConfig for it, or the code above when there is none
	// — so a publish in the builder changes validation, editable fields,
	// populate, the table's config and the rest without a redeploy.
	router.use(async (req: any, res: any, next: any) => {
		try {
			req.resolvedRoute = await resolveRoute(resourceRouteKey(req), {
				Model,
				settings,
				frontendConfig,
				built: config,
			});
			// Which copy served this request — for debugging only; the body has
			// the same shape either way.
			const { sources } = req.resolvedRoute;
			res.setHeader('X-Route-Source', `settings=${sources.settings}; config=${sources.config}`);
			next();
		} catch (e) {
			next(e);
		}
	});

	// A middleware or controller built from the resolved route at request time
	// instead of from the code config at boot. The factories are closures over
	// their options, so building one per request costs nothing worth caching.
	const R =
		(make: (built: any, resolved: ResolvedRoute) => any) => (req: any, res: any, next: any) =>
			make(req.resolvedRoute.built, req.resolvedRoute)(req, res, next);

	//Define the middlewares
	const middlewares = {
		//Middleware for creating a new category
		post: [
			protect,
			R(c => validate(c.VALIDATORS.POST)),
			R(c => ifExists(c.EXIST_OPTIONS)),
			hasPermission([permissions.create]),
			...(injectMiddleware?.post || []),
		],
		//Middleware for getting all categories
		getAll: [
			protect,
			paginate,
			R(c => filter(c.FILTER_OPTIONS)),
			hasPermission([permissions.read]),
			...(injectMiddleware?.getAll || []),
		],
		//Middleware for updating a category
		update: [
			protect,
			R(c => validate(c.VALIDATORS.UPDATE)),
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
		export: [protect, R(c => filter(c.FILTER_OPTIONS)), ...(injectMiddleware?.export || [])],
		// Middleware for filtering documents
		filter: [protect, ...(injectMiddleware?.filter || [])],
		distinct: [protect, R(c => filter(c.FILTER_OPTIONS)), ...(injectMiddleware?.distinct || [])],
	};

	//GENERIC_ROUTES
	// Define the routes
	router
		.route('/')
		.get(...middlewares.getAll, replaceController?.getAll || R(c => getAllDocuments(c.QUERY_OPTIONS)))
		.post(...middlewares.post, replaceController?.post || createDocument(config.MODEL));

	//:id is a dynamic parameter that will be extracted from the URL
	router
		.route('/:id')
		.get(
			...middlewares.getById,
			replaceController?.getById || R(c => getDocumentById(c.QUERY_OPTIONS))
		)
		.put(...middlewares.update, replaceController?.update || R(c => updateDocument(c.EDITS)))
		.delete(...middlewares.delete, replaceController?.delete || deleteDocument(config.MODEL));

	//:code is a dynamic parameter that will be extracted from the URL
	router
		.route('/g/code/:code')
		.get(
			...middlewares.getByCode,
			replaceController?.getByCode || R(c => getDocumentByCode(c.QUERY_OPTIONS))
		);

	//:id is a dynamic parameter that will be extracted from the URL
	router
		.route('/g/id/:id')
		.get(
			...middlewares.getById,
			replaceController?.getById || R(c => getDocumentById(c.QUERY_OPTIONS))
		);

	//:id is a dynamic parameter that will be extracted from the URL
	router
		.route('/g/slug/:slug')
		.get(
			...middlewares.getBySlug,
			replaceController?.getBySlug || R(c => getDocumentBySlug(c.QUERY_OPTIONS))
		);

	// One record laid out by the route's `view` config, with the records it
	// references and the ones that reference it. 404 without a view config.
	router.get(
		'/get/view/:id',
		...middlewares.getById,
		R((c, r) => getViewDocument({ resolved: r, Model }))
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
		replaceController?.updateMany || R(c => updateManyDocuments(c.EDITS))
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
	router.get('/get/schema', replaceController?.schema || R(c => getSchema(c.SCHEMA)));
	// Registered for every route, not only those with a config file: a
	// RouteConfig published in the builder makes any route a generic page.
	// With neither, these answer exactly as an unregistered path did.
	const noConfig = (req: any, res: any) =>
		res
			.status(404)
			.json({ error: 'Not Found', message: 'The requested resource could not be found' });

	router.get(
		'/get/config',
		replaceController?.config ||
			R((c, r) =>
				r.frontendConfig ? getConfig({ config: r.frontendConfig, schema: c.SCHEMA, route }) : noConfig
			)
	);

	router.get(
		'/get/route',
		replaceController?.config ||
			R((c, r) =>
				// A route with no config file whose published config has no page
				// header (only a view, say) hasn't gained a table page: it answers
				// as it did before it had any config.
				!r.frontendConfig || (!frontendConfig && !r.frontendConfig.route && !route)
					? noConfig
					: getPageRoute({ config: r.frontendConfig, route })
			)
	);

	//Export as CSV and PDF
	router.post(
		'/export/csv',
		...middlewares.export,
		replaceController?.export || R(c => exportCsv(c.EXPORT_OPTIONS))
	);
	router.post(
		'/export/pdf',
		...middlewares.export,
		replaceController?.export || R(c => exportPdf(c.EXPORT_OPTIONS))
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
