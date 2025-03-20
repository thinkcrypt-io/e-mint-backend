import express from 'express';

import { categoryRoute, storeRoute, productRoute, orderRoute, otpRoute } from './index.js';
import { emailSubscriptionRouter } from '../user-routes/index.js';

const router = express.Router();

router.use('/store', storeRoute);
router.use('/categories', categoryRoute);
router.use('/products', productRoute);
router.use('/orders', orderRoute);
router.use('/otp', otpRoute);
router.use('/email-subscriptions', emailSubscriptionRouter);

export default router;
