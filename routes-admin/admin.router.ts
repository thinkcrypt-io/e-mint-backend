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
	JobApplication,
	jobApplicationSettings,
	getModelKeys,
	Meeting,
	meetingSettings,
	AdminInvoice,
	adminInvoiceSettings,
	Leave,
	leaveSettings,
	softwareSettings,
	Software,
	TeamMember,
	teamMemberSettings,
	Portfolio,
	portfolioSettings,
	Service,
	serviceSettings,
	Issue,
	issueSettings,
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
	'/repos',
	defineRoutes({ Model: Project, settings: projectSettings, permission: 'adminrole' })
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
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
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

router.use(
	'/jobapplications',
	defineRoutes({
		Model: JobApplication,
		settings: jobApplicationSettings,
		permission: 'jobapplications',
	})
);

router.get('/model/:id/:type', getModelKeys);

router.use(
	'/meetings',
	defineRoutes({
		Model: Meeting,
		settings: meetingSettings,
		permission: 'meetings',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	})
);

router.use(
	'/invoices',
	defineRoutes({
		Model: AdminInvoice,
		settings: adminInvoiceSettings,
		permission: 'invoices',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	})
);

router.use(
	'/leaves',
	defineRoutes({
		Model: Leave,
		settings: leaveSettings,
		permission: 'leaves',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	})
);

router.use(
	'/projects',
	defineRoutes({
		Model: Software,
		settings: softwareSettings,
		permission: 'softwares',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	})
);

router.use(
	'/teams',
	defineRoutes({
		Model: TeamMember,
		settings: teamMemberSettings,
		permission: 'teams',
	})
);

router.use(
	'/portfolios',
	defineRoutes({
		Model: Portfolio,
		settings: portfolioSettings,
		permission: 'portfolios',
	})
);

router.use(
	'/services',
	defineRoutes({
		Model: Service,
		settings: serviceSettings,
		permission: 'services',
	})
);

router.use(
	'/issues',
	defineRoutes({
		Model: Issue,
		settings: issueSettings,
		permission: 'issues',
	})
);

export default router;
