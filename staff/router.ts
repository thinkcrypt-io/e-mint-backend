import express from 'express';

import authRoute from './staffAuthRoute.js';
import productRoute from './products.staff.route.js';
import categoriesRoute from './controllers/categories.staff.route.js';

const router = express.Router();

router.use('/auth', authRoute);
router.use('/products', productRoute);
router.use('/categories', categoriesRoute);

export default router;
