import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import loginController from '../controllers/auth/login.controller.js';
import registerController from '../controllers/auth/register.controller.js';
import getSelf from '../controllers/auth/getSelf.controller.js';
import updateSellerPreferences from '../controllers/auth/updatePreference.controller.js';

const router = express.Router();

//route for: /api/auth route
router
	.post('/login', loginController)
	.post('/register', registerController)
	.get('/self', protect, getSelf);

router.put('/update/preferences', protect, updateSellerPreferences);

// router.post('/request-password-change', requestPasswordChange);
// router.get('/verify-reset-token/:token', verifyToken);
// router.post('/reset', resetPassword);

export default router;
