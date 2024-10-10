import express from 'express';
import { protect } from '../middleware/index.js';

import {
	updateSellerSelf,
	updateSellerPreferences,
	login,
	register,
	getSellerSelf,
} from '../controllers/auth/index.js';

const router = express.Router();

//route for: /api/auth route
router.post('/login', login).post('/register', register).get('/self', protect, getSellerSelf);

router.put('/update/preferences', protect, updateSellerPreferences);
router.put('/update/self', protect, updateSellerSelf);

// router.post('/request-password-change', requestPasswordChange);
// router.get('/verify-reset-token/:token', verifyToken);
// router.post('/reset', resetPassword);

export default router;
