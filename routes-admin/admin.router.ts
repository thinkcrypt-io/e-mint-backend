import express from 'express';
import {
	adminAuthRoute,
	adminShopRoute,
	adminSellerRoute,
	packagesRoute,
	subscriptionRoute,
	productRoute,
	customerRoute,
} from './index.js';

const router = express.Router();

router.use('/auth', adminAuthRoute);
router.use('/shops', adminShopRoute);
router.use('/sellers', adminSellerRoute);
router.use('/packages', packagesRoute);
router.use('/subscriptions', subscriptionRoute);
router.use('/products', productRoute);
router.use('/customers', customerRoute);

export default router;
