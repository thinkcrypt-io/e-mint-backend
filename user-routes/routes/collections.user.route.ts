import express from 'express';
import sort from '../../middleware/pagination.middleware.js';
import query from '../../middleware/filter.middleware.js';
import Collection, { settings } from '../../models/collection/collection.model.js';
import getAllDocuments from '../../controllers/common/getAllDocuments.controller.js';
import getDocumentById from '../../controllers/common/getDocumentById.controller.js';
import constructConfig from '../../lib/configurator/constructConfig.js';
import getFilters from '../../controllers/common/getFilters.controller.js';
import validate from '../../middleware/validate.middleware.js';
import ifExists from '../../middleware/isExists.middleware.js';
import createDocument from '../../controllers/common/createDocument.controller.js';
import { protect } from '../../middleware/auth.middleware.js';
import updateDocument from '../../controllers/common/updateDocument.controller.js';
import updateManyDocuments from '../../controllers/common/updateManyDocuments.controller.js';
import getDocumentToEditById from '../../controllers/common/getDocumentToEditById.controller.js';
import hasPermission from '../../middleware/hasPermission.middleware.js';

const router = express.Router();

const config = constructConfig({
	model: Collection,
	config: settings,
});

const commonMiddleware = [
	// protect,
	sort,
	query(config.FILTER_OPTIONS),
	// hasPermission(['view_collection']),
];
const postMiddleware = [
	protect,
	validate(config.VALIDATORS.POST),
	hasPermission(['add_collection']),
	ifExists(config.EXIST_OPTIONS),
];

router.route('/').get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS));
router.get(
	'/:id',
	// protect,
	// hasPermission(['view_collection']),
	getDocumentById(config.QUERY_OPTIONS)
);
// router.post('/', ...postMiddleware, createDocument(config.MODEL));
// router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
// router.put('/:id', protect, hasPermission(['edit_collection']), updateDocument(config.EDITS));
// router.put(
// 	'/update/many',
// 	protect,
// 	hasPermission(['edit_collection']),
// 	updateManyDocuments(config.EDITS)
// );
// router.get(
// 	'/edit/:id',
// 	protect,
// 	hasPermission(['view_collection']),
// 	getDocumentToEditById(config.MODEL)
// );

export default router;
