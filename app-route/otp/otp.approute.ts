import express from 'express';

import validateOtp from './controllers/validateOtp.controller.js';
import generateOtpController from './controllers/generateOtp.controller.js';

const router = express.Router();

router.post('/', generateOtpController);
router.post('/verify', validateOtp);

export default router;
