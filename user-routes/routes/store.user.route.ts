import express from 'express';
import getStore from '../../user-controllers/store/getStore.controller.js';
import { shop } from '../../middleware/userAuth.middleware.js';

const router = express.Router();

router.get('/', shop, getStore);

export default router;
