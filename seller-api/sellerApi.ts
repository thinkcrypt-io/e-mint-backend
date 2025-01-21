import {
	authRoute,
	categoryRoute,
	productRoute,
	customerRoute,
	orderRoute,
	permissionRoute,
	userRoute,
	uploadRoute,
	collectionRoute,
	contentRoute,
	feedbackRoute,
	scanRoute,
	qrRoute,
	roleRoute,
	restaurantRoute,
	itemRoute,
	expenseRoute,
	expenseCategoryRoute,
	brandRoute,
	adjustmentRoute,
	paymentRoute,
	invoiceRoute,
	returnRoute,
	deliveryRoute,
	ledgerRoute,
	supplierRoute,
	groupRoute,
	purchaseRoute,
	couponRoute,
	smsRoute,
	assetRoute,
	paymentAccountRoute,
	deploymentRoute,
	activeThemeRoute,
	locationRoute,
	staffRoute,
	inventoryRoute,
	transferRoute,
} from '../routes/index.js';
import express from 'express';

const router = express.Router();

router.use('/auth', authRoute);
router.use('/brands', brandRoute);
router.use('/categories', categoryRoute);
router.use('/contents', contentRoute);
router.use('/adjustments', adjustmentRoute);
router.use('/coupons', couponRoute);

router.use('/items', itemRoute);
router.use('/products', productRoute);
router.use('/customers', customerRoute);
router.use('/deliveries', deliveryRoute);

router.use('/restaurant', restaurantRoute);
router.use('/collections', collectionRoute);
router.use('/orders', orderRoute);
router.use('/roles', roleRoute);
router.use('/permissions', permissionRoute);
router.use('/users', userRoute);
router.use('/payments', paymentRoute);

router.use('/expenses', expenseRoute);
router.use('/expense-categories', expenseCategoryRoute);

router.use('/scans', scanRoute);
router.use('/upload', uploadRoute);
router.use('/feedbacks', feedbackRoute);
router.use('/qr', qrRoute);
router.use('/invoices', invoiceRoute);
router.use('/returns', returnRoute);

router.use('/ledgers', ledgerRoute);
router.use('/suppliers', supplierRoute);
router.use('/groups', groupRoute);
router.use('/purchases', purchaseRoute);
router.use('/sms', smsRoute);
router.use('/assets', assetRoute);
router.use('/payment-accounts', paymentAccountRoute);

router.use('/deployments', deploymentRoute);
router.use('/active-theme', activeThemeRoute);
router.use('/locations', locationRoute);
router.use('/staffs', staffRoute);
router.use('/inventories', inventoryRoute);
router.use('/transfers', transferRoute);

export default router;
