import express from 'express';
import { adminProtect } from '../../middlewares/_index.js';
import {
	loginController,
	getSelfController,
	updatePreferencesController,
	updateSelfController,
} from '../../controllers/auth/_index.js';
import { Admin } from '../../models/_index.js';

const router = express.Router();

router.post('/login', loginController({ model: Admin, checkActive: true }));
router.get('/self', adminProtect, getSelfController({ model: Admin, populate: 'role' }));
router.put('/', adminProtect, updateSelfController({ model: Admin }));
router.put('/update/preferences', adminProtect, updatePreferencesController({ model: Admin }));

export default router;
