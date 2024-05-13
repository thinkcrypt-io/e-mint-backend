import express from 'express';
import sort from '../middleware/pagination.middleware.js';
import query from '../middleware/filter.middleware.js';
import getAllDocuments from '../controllers/common/getAllDocuments.controller.js';
import getDocumentById from '../controllers/common/getDocumentById.controller.js';
import constructConfig from '../lib/configurator/constructConfig.js';
import getFilters from '../controllers/common/getFilters.controller.js';
import validate from '../middleware/validate.middleware.js';
import ifExists from '../middleware/isExists.middleware.js';
import createDocument from '../controllers/common/createDocument.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import Session, { settings } from '../models/restaurant/restauant.model.js';
import createSession from '../controllers/session/createSession.controller.js';
import endSession from '../controllers/session/endSession.controller.js';

const router = express.Router();

const config = constructConfig({
	model: Session,
	config: settings,
});

const commonMiddleware = [protect, sort, query(config.FILTER_OPTIONS)];
const postMiddleware = [protect, validate(config.VALIDATORS.POST), ifExists(config.EXIST_OPTIONS)];

router.route('/').get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS));
router.get('/:id', protect, getDocumentById(config.QUERY_OPTIONS));
router.post('/start-session', createSession);
router.post('/end-session', endSession);
router.get('/get/filters', getFilters(config.FILTER_LIST));

export default router;
