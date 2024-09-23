import express from 'express';
import { protect } from '../middleware/userAuth.middleware.js';
import loginController from '../controllers/auth/login.controller.js';
import registerController from '../controllers/auth/register.controller.js';
import getSelf from '../controllers/auth/getSelf.controller.js';
import updateSellerPreferences from '../controllers/auth/updatePreference.controller.js';
import userLoginController from '../controllers/auth/userLogin.controller.js';
import userRegisterController from '../controllers/auth/userRegister.controller.js';
import userGetSelf from '../controllers/auth/userGetSelf.controller.js';

const router = express.Router();

//route for: /api/auth route
router
	.post('/login', userLoginController)
	.post('/register', userRegisterController)
	.get('/self', protect, userGetSelf);

router.put('/update/preferences', protect, updateSellerPreferences);

// router.post('/request-password-change', requestPasswordChange);
// router.get('/verify-reset-token/:token', verifyToken);
// router.post('/reset', resetPassword);

export default router;
