import express from 'express';
import {
	adminLoginController,
	adminGetSelfController,
	adminUpdateSelfCongroller,
	updateAdminPreferences,
	adminForgotPasswordController,
	adminResetPasswordController,
	adminChangePasswordController,
} from './controllers/index.js';
import { adminProtect } from '../../imports.js';

const router = express.Router();

router.post('/login', adminLoginController);
router.post('/forgot-password', adminForgotPasswordController);
router.post('/reset-password/:token', adminResetPasswordController);
router.get('/self', adminProtect, adminGetSelfController);
router.put('/', adminProtect, adminUpdateSelfCongroller);
// Alias for the frontend's actual call (`useUpdateSelfMutation` posts to
// `auth/update/self`, matching the seller/user self-update convention) — the
// bare `PUT /` route above was the only one wired, so self-edit 404'd.
router.put('/update/self', adminProtect, adminUpdateSelfCongroller);
router.put('/update/preferences', adminProtect, updateAdminPreferences);
// The admin app's "Change Password" (useUpdatePasswordMutation) — had no route and 404'd.
router.put('/change-password', adminProtect, adminChangePasswordController);

export default router;
