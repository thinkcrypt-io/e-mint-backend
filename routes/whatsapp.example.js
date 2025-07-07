// Add this to your routes file (e.g., routes/whatsapp.routes.js)

import express from 'express';
import sendWhatsapp from '../controllers/common/sendWhatsapp.controller.js';

const router = express.Router();

// POST /api/whatsapp/send
router.post('/send', sendWhatsapp);

export default router;
