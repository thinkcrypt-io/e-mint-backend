import express from 'express';

import authRoute from './staffAuthRoute.js';
import productRoute from './products.staff.route.js';
import categoriesRoute from './controllers/categories.staff.route.js';
import orderRoute from './order.staff.route.js';
import customerRoute from './customer.staff.route.js';
import expenseRoute from './expense.staff.route.js';
import inventoriesRoute from './inventory.staff.route.js';

const router = express.Router();

router.use('/auth', authRoute);
router.use('/products', productRoute);
router.use('/categories', categoriesRoute);
router.use('/orders', orderRoute);
router.use('/customers', customerRoute);
router.use('/expenses', expenseRoute);
router.use('/inventories', inventoriesRoute);

export default router;
