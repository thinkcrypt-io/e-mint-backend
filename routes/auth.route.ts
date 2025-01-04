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
} from '../controllers/index.js';
import Shop from '../models/shop/shop.model.js';
import changeSellerPassword from '../controllers/auth/changeSellerPassword.controller.js';

const router = express.Router();

//route for: /api/auth route
router.post('/login', login).post('/register', register).get('/self', protect, getSellerSelf);

router.put('/update/preferences', protect, updateSellerPreferences);
router.put('/update/self', protect, updateSellerSelf);

router.put(
	'/update/shop/edit/:id',
	protect,
	UpdateShop({
		model: Shop,
		allowEdits: [
			'name',
			'phone',
			'email',
			'description',
			'address',
			'logo',
			'activeTheme',
			'dateActivated',
			'faq',
			'terms',
			'coverImage',
			'website',
			'facebook',
			'twitter',
			'instagram',
			'linkedin',
			'youtube',
			'whatsapp',
			'daraz',
			'tiktok',
			'telegram',
		],
	})
);

router.post('/shop/register', shopRegister);
router.put('/change-password', protect, changeSellerPassword);

// router.get('/verify-reset-token/:token', verifyToken);
// router.post('/reset', resetPassword);

export default router;
