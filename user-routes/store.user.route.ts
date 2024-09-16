import express from 'express';
import getStore from '../user-controllers/store/getStore.controller.js';

const router = express.Router();

router.get('/', getStore);

export default router;
