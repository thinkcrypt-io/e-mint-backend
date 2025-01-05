import express from 'express';
import { protect } from '../middleware/index.js';

import {
	updateSellerSelf,
	updateSellerPreferences,
	login,
	register,
	getSellerSelf,
	shopRegister,
	UpdateShop,
	getActiveTheme,
} from '../controllers/index.js';
import Shop from '../models/shop/shop.model.js';
import changeSellerPassword from '../controllers/auth/changeSellerPassword.controller.js';

const router = express.Router();

//route for: /api/auth route
router.get('/', protect, getActiveTheme);

export default router;
