import express from 'express';
// import {
// 	adminLoginController,
// 	adminGetSelfController,
// 	adminUpdateSelfCongroller,
// 	updateAdminPreferences,
// } from '../controllers/index.js';
// import { adminProtect } from '../../imports.js';
import { protect } from './controllers/auth.staff.controller.js';
import staffLoginController from './controllers/login.staff.controller.js';
import staffGetSelfController from './controllers/self.staff.controller.js';
import { Staff, updatePreference } from '../imports.js';

const router = express.Router();

router.post('/login', staffLoginController);
router.get('/self', protect, staffGetSelfController);

router.put('/update/preferences', protect, updatePreference(Staff));

// router.put('/', protect, adminUpdateSelfCongroller);
// router.put('/update/preferences', adminProtect, updateAdminPreferences);

export default router;
