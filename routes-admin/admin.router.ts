import express from 'express';
import {
	adminAuthRoute,
	adminShopRoute,
	adminSellerRoute,
	packagesRoute,
	subscriptionRoute,
	productRoute,
	customerRoute,
	themeRouter,
	uploadRoute,
	purchasedThemeRoute,
	smsRoute,
} from './index.js';
import {
	Admin,
	AdminRole,
	adminRoleSettings,
	adminSettings,
	defineRoutes,
	Lead,
	leadSettings,
	Project,
	projectSettings,
	Client,
	clientSettings,
	docSettings,
	Doc,
	JobPost,
	jobPostSettings,
} from '../imports.js';
import hasAccess from './middlewares/hasAccess.middleware.js';

const router = express.Router();

router.use('/auth', adminAuthRoute);
router.use('/shops', adminShopRoute);
router.use('/sellers', adminSellerRoute);
router.use('/packages', packagesRoute);
router.use('/subscriptions', subscriptionRoute);
router.use('/products', productRoute);
router.use('/customers', customerRoute);
router.use('/themes', themeRouter);
router.use('/upload', uploadRoute);
router.use('/purchasedthemes', purchasedThemeRoute);

router.use('/sms', smsRoute);

router.use('/leads', defineRoutes({ Model: Lead, settings: leadSettings, permission: 'lead' }));
router.use('/admins', defineRoutes({ Model: Admin, settings: adminSettings, permission: 'admin' }));
router.use(
	'/adminroles',
	defineRoutes({ Model: AdminRole, settings: adminRoleSettings, permission: 'adminrole' })
);
router.use(
	'/projects',
	defineRoutes({ Model: Project, settings: projectSettings, permission: 'adminrole' })
);

router.use(
	'/clients',
	defineRoutes({ Model: Client, settings: clientSettings, permission: 'client' })
);

router.use(
	'/clients',
	defineRoutes({ Model: Client, settings: clientSettings, permission: 'client' })
);

router.use(
	'/documents',
	defineRoutes({
		Model: Doc,
		settings: docSettings,
		permission: 'documents',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()] },
	})
);

router.use(
	'/jobposts',
	defineRoutes({
		Model: JobPost,
		settings: jobPostSettings,
		permission: 'jobposts',
	})
);

export default router;
