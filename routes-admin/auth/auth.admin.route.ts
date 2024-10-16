import express from 'express';
import {
	adminLoginController,
	adminGetSelfController,
	adminUpdateSelfCongroller,
	updateAdminPreferences,
} from './controllers/index.js';
import { adminProtect } from '../../imports.js';

const router = express.Router();

router.post('/login', adminLoginController);
router.get('/self', adminProtect, adminGetSelfController);
router.put('/', adminProtect, adminUpdateSelfCongroller);
router.put('/update/preferences', adminProtect, updateAdminPreferences);

export default router;
