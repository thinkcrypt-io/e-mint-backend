// Example route integration - Add this to your existing routes or create a new route file

import express from 'express';
import sendWhatsapp from '../controllers/common/sendWhatsapp.controller.js';
import validateWhatsappTemplate from '../controllers/common/validateWhatsappTemplate.controller.js';

const router = express.Router();

// POST /api/whatsapp/send
router.post('/send', sendWhatsapp);

// POST /api/whatsapp/validate-template
router.post('/validate-template', validateWhatsappTemplate);

export default router;

// Don't forget to add this to your main app.js:
// import whatsappRoutes from './routes/whatsapp.routes.js';
// app.use('/api/whatsapp', whatsappRoutes);
