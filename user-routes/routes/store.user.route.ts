import express from 'express';
import getStore from '../../user-controllers/store/getStore.controller.js';
import { shop } from '../../middleware/userAuth.middleware.js';
import getHongoStore from '../../user-controllers/store/getHongoStore.controller.js';
import { getUserContent, Pulse } from '../../imports.js';

const router = express.Router();

router.get('/', shop, getStore);

router.get('/hongo', shop, getHongoStore);
router.get('/pulse', shop, getUserContent(Pulse));

export default router;
