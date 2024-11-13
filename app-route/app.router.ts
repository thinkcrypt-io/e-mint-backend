import express from 'express';

import { categoryRoute, storeRoute, productRoute, orderRoute } from './index.js';

const router = express.Router();

router.use('/store', storeRoute);
router.use('/categories', categoryRoute);
router.use('/products', productRoute);
router.use('/orders', orderRoute);

export default router;
