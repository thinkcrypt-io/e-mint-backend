import express from 'express';

import {
	userStoreRoute,
	userCategoryRoute,
	userCollectionRoute,
	userProductRoute,
	userAuthRoute,
	userOrder,
	emailSubscriptionRouter,
} from './index.js';

const router = express.Router();

//user routes.
router.use('/store', userStoreRoute);
router.use('/categories', userCategoryRoute);
router.use('/collections', userCollectionRoute);
router.use('/products', userProductRoute);
router.use('/auth', userAuthRoute);
router.use('/orders', userOrder);
router.use('/email-subscriptions', emailSubscriptionRouter);
router.use('/store/hongo', userStoreRoute);

export default router;
