import express from 'express';
import { adminAuthRoute, adminShopRoute, adminSellerRoute } from './index.js';

const router = express.Router();

router.use('/auth', adminAuthRoute);
router.use('/shops', adminShopRoute);
router.use('/sellers', adminSellerRoute);

export default router;
