import express from 'express';
import sort from '../middleware/pagination.middleware.js';
import query from '../middleware/filter.middleware.js';
import User, { settings } from '../models/user/user.model.js';
import getAllDocuments from '../controllers/common/getAllDocuments.controller.js';
import getDocumentById from '../controllers/common/getDocumentById.controller.js';
import constructConfig from '../lib/configurator/constructConfig.js';
import getFilters from '../controllers/common/getFilters.controller.js';
import validate from '../middleware/validate.middleware.js';
import ifExists from '../middleware/isExists.middleware.js';
import createDocument from '../controllers/common/createDocument.controller.js';
import { isExpired } from '../imports.js';

const router = express.Router();

const config = constructConfig({
	model: User,
	config: settings,
});

const commonMiddleware = [sort, query(config.FILTER_OPTIONS)];
const postMiddleware = [validate(config.VALIDATORS.POST), ifExists(config.EXIST_OPTIONS)];

router.route('/').get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS));
router.get('/:id', getDocumentById(config.QUERY_OPTIONS));
router.post('/', isExpired, ...postMiddleware, createDocument(config.MODEL));
router.get('/get/filters', getFilters(config.FILTER_LIST));

export default router;
