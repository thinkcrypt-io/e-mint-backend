// Import necessary modules from their respective files
import express from 'express';

import getCount from '../controllers/common/getCount.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import Scan from '../models/scan/scan.model.js';

// Initialize a new router
const router = express.Router();

// Export the router
router.get('/get/count', protect, getCount(Scan));
export default router;
