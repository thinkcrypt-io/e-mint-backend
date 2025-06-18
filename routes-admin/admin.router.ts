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
	Maintenance,
	maintenanceSettings,
	AdminExpense,
	adminExpenseSettings,
	Resource,
	resourceSettings,
	Component,
	componentSettings,
	Prop,
	propSettings,
	PlannedProject,
	plannedProjectSettings,
	PlannedFeature,
	plannedFeatureSettings,
	PlannedPage,
	plannedPageSettings,
	PlannedModel,
	plannedModelSettings,
	ModelAttributes,
	modelAttributesSettings,
	BillSubscription,
	billSubscriptionSettings,
	TCClient,
	tcClientSettings,
	billSettings,
	Bill,
	Employee,
	employeeSettings,
	FacebookGroups,
	facebookGroupsSettings,
	notAllowed,
	Email,
	emailSettings,
	Offer,
	offerSettings,
	Feature,
	featureSettings,
	Solution,
	solutionSettings,
	TechStack,
	techStackSettings,
	ServiceCategory,
	serviceCategorySettings,
	View,
	viewSettings,
	Click,
	clickSettings,
	Blog,
	blogSettings,
	Author,
	authorSettings,
	NpmLibrary,
	npmLibrarySettings,
	blogConfig,
} from '../imports.js';
import hasAccess from './middlewares/hasAccess.middleware.js';
import { getAdminSidebar, trackView } from '../controllers/index.js';
import trackClick from '../controllers/views/trackClick.controller.js';

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
router.use(
	'/fgroups',
	defineRoutes({ Model: FacebookGroups, settings: facebookGroupsSettings, permission: 'lead' })
);

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
	'/employees',
	defineRoutes({
		Model: Employee,
		settings: employeeSettings,
		permission: 'employee',
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

router.use(
	'/resources',
	defineRoutes({
		Model: Resource,
		settings: resourceSettings,
		permission: 'resources',
	})
);

router.use(
	'/maintenances',
	defineRoutes({
		Model: Maintenance,
		settings: maintenanceSettings,
		permission: 'maintenances',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	})
);

router.use(
	'/expenses',
	defineRoutes({
		Model: AdminExpense,
		settings: adminExpenseSettings,
		permission: 'expenses',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	})
);

router.use(
	'/components',
	defineRoutes({
		Model: Component,
		settings: componentSettings,
		permission: 'components',
	})
);

router.use(
	'/props',
	defineRoutes({
		Model: Prop,
		settings: propSettings,
		permission: 'props',
	})
);

router.use(
	'/plannedmodels',
	defineRoutes({
		Model: PlannedModel,
		settings: plannedModelSettings,
		permission: 'plans',
	})
);
router.use(
	'/plannedprojects',
	defineRoutes({
		Model: PlannedProject,
		settings: plannedProjectSettings,
		permission: 'plans',
	})
);
router.use(
	'/plannedfeatures',
	defineRoutes({
		Model: PlannedFeature,
		settings: plannedFeatureSettings,
		permission: 'plans',
	})
);
router.use(
	'/plannedpages',
	defineRoutes({
		Model: PlannedPage,
		settings: plannedPageSettings,
		permission: 'plans',
	})
);

router.use(
	'/modelattributes',
	defineRoutes({
		Model: ModelAttributes,
		settings: modelAttributesSettings,
		permission: 'plans',
	})
);

router.use(
	'/billsubscriptions',
	defineRoutes({
		Model: BillSubscription,
		settings: billSubscriptionSettings,
		permission: 'subscriptions',
	})
);

router.use(
	'/tcclients',
	defineRoutes({
		Model: TCClient,
		settings: tcClientSettings,
		permission: 'website',
	})
);

router.use(
	'/bills',
	defineRoutes({
		Model: Bill,
		settings: billSettings,
		permission: 'bill',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	})
);

router.use(
	'/emails',
	defineRoutes({
		Model: Email,
		settings: emailSettings,
		permission: 'email',
	})
);

router.use(
	'/offers',
	defineRoutes({
		Model: Offer,
		settings: offerSettings,
		permission: 'email',
	})
);

router.use(
	'/features',
	defineRoutes({
		Model: Feature,
		settings: featureSettings,
		permission: 'email',
	})
);

router.use(
	'/solutions',
	defineRoutes({
		Model: Solution,
		settings: solutionSettings,
		permission: 'email',
	})
);

router.use(
	'/techstacks',
	defineRoutes({
		Model: TechStack,
		settings: techStackSettings,
		permission: 'email',
	})
);

router.use(
	'/servicecategories',
	defineRoutes({
		Model: ServiceCategory,
		settings: serviceCategorySettings,
		permission: 'email',
	})
);

router.get('/sidebar/:platform/:page', getAdminSidebar());

router.use(
	'/blogs',
	defineRoutes({
		Model: Blog,
		settings: blogSettings,
		permission: 'email',
		frontendConfig: blogConfig,
	})
);

router.use(
	'/authors',
	defineRoutes({
		Model: Author,
		settings: authorSettings,
		permission: 'email',
	})
);

router.use(
	'/views',
	defineRoutes({
		Model: View,
		settings: viewSettings,
		permission: 'email',
		replaceController: {
			post: trackView,
		},
	})
);

router.use(
	'/clickevents',
	defineRoutes({
		Model: Click,
		settings: clickSettings,
		permission: 'email',
		replaceController: {
			post: trackClick,
		},
	})
);

router.use(
	'/npmlibraries',
	defineRoutes({
		Model: NpmLibrary,
		settings: npmLibrarySettings,
		permission: 'email',
	})
);

export default router;
