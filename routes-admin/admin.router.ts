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
	adminRoleCOnfig,
	SidebarCategory,
	sidebarCategorySettings,
	sidebarCategoryConfig,
	SidebarItem,
	sidebarItemSettings,
	sidebarItemConfig,
	adminProtect,
	AdminFile,
	adminFileConfig,
	adminFileSettings,
	Permission,
	permissionSettings,
	permissionConfig,
	Page,
	pageSettings,
	pageConfig,
	Domain,
	domainSettings,
	domainConfig,
	Social,
	socialSettings,
	socialConfig,
	Meta,
	metaSettings,
	metaConfig,
	imageSettings,
	imageConfig,
	customQuery,
	Folder,
	folderSettings,
	folderConfig,
	History,
	historySettings,
	historyConfig,
	Prospect,
	prospectSettings,
	prospectConfig,
	Hosting,
	hostingSettings,
	hostingConfig,
	URL,
	urlSettings,
	urlConfig,
	Model,
	modelSettings,
	modelConfig,
	TableConfig,
	tableConfigSettings,
	tableConfigConfig,
	FieldConfig,
	fieldConfigSettings,
	fieldConfigConfig,
	doesModelExist,
	Credential,
	credentialSettings,
	credentialConfig,
	Vacancy,
	vacancySettings,
	vacancyConfig,
	adminInvoiceConfig,
	Content,
	contentSettings,
	contentConfig,
	PaymentMethod,
	paymentMethodSettings,
	paymentMethodConfig,
	HerokuAccount,
	herokuSettings,
	herokuConfig,
	VercelAccount,
	vercelSettings,
	vercelConfig,
} from '../imports.js';
import hasAccess from './middlewares/hasAccess.middleware.js';
import { adminPermissions } from '../middleware/index.js';
import {
	verifyHerokuKey,
	createHerokuAccount,
	updateHerokuKey,
	getHerokuAccount,
	getHerokuActivity,
	getHerokuBilling,
	getHerokuUsage,
	getHerokuApps,
	getHerokuApp,
	getHerokuAppResources,
	getHerokuConfigVars,
	updateHerokuConfigVars,
	downloadHerokuConfigVars,
	getHerokuReleases,
	getHerokuCurrentRelease,
	rollbackHerokuRelease,
	redeployHerokuApp,
	getHerokuBuilds,
	createHerokuBuild,
	getHerokuDynos,
	restartHerokuApp,
	restartHerokuDyno,
	updateHerokuFormation,
	setHerokuMaintenance,
	renameHerokuApp,
	destroyHerokuApp,
	getHerokuLogs,
} from '../controllers/heroku/index.js';

import {
	verifyVercelToken,
	createVercelAccount,
	updateVercelToken,
	getVercelAccount,
	getVercelTeams,
	getVercelActivity,
	getVercelUsage,
	getVercelAccountResources,
	getVercelProjects,
	getVercelProject,
	createVercelProject,
	updateVercelProject,
	deleteVercelProject,
	getVercelProjectResources,
	getVercelEnv,
	updateVercelEnv,
	downloadVercelEnv,
	revealVercelEnv,
	getVercelDeployments,
	getVercelDeployment,
	createVercelDeployment,
	promoteVercelDeployment,
	cancelVercelDeployment,
	deleteVercelDeployment,
	getVercelBuildLogs,
	getVercelDomains,
	addVercelDomain,
	verifyVercelDomain,
	removeVercelDomain,
} from '../controllers/vercel/index.js';
import { setRepoHosting } from '../controllers/repo/index.js';
import { getAdminPermissionList, getAdminSidebar, trackView } from '../controllers/index.js';
import trackClick from '../controllers/views/trackClick.controller.js';
import deleteMedia from './file/deleteMedia.controller.js';
import downloadInvoicePdf from './invoice/downloadInvoicePdf.controller.js';
import getPublicInvoice from './invoice/getPublicInvoice.controller.js';
import sendWhatsapp from '../controllers/common/sendWhatsapp.controller.js';
import { listAllCollections } from '../library/index.js';
import adminInvitationRoute from './admin-invitation/adminInvitation.route.js';
import {
	Config,
	configConfig,
	configSettings,
	FormField,
	formFieldConfig,
	formFieldSettings,
	Setting,
	settingConfig,
	settingSettings,
} from '../library/models/_index.js';
import { getDocumentHistory } from '../library/controllers/history/_index.js';
import builderRouter from '../library/controllers/builder/_index.js';
import { dynamicModelsDispatcher } from '../library/functions/dynamicModels.function.js';
import { accessUsersRouter, notificationsRouter } from '../library/controllers/notifications/_index.js';

const router = express.Router();

router.use('/auth', adminAuthRoute);
router.use('/admin-invitations', adminInvitationRoute);
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

router.get('/mongoose/list', listAllCollections);
router.get('/model/:id/:type', getModelKeys);

router.post('/whatsapp/send', sendWhatsapp);

router.use('/builder', builderRouter);

router.get('/sidebar/:platform/:type', adminProtect, getAdminSidebar());
router.get('/permissionlist', getAdminPermissionList());

router.use('/leads', defineRoutes({ Model: Lead, settings: leadSettings, permission: 'lead' }));
router.use(
	'/fgroups',
	defineRoutes({ Model: FacebookGroups, settings: facebookGroupsSettings, permission: 'lead' }),
);

router.use('/admins', defineRoutes({ Model: Admin, settings: adminSettings, permission: 'admin' }));
router.use(
	'/adminroles',
	defineRoutes({
		Model: AdminRole,
		settings: adminRoleSettings,
		permission: 'adminroles',
		frontendConfig: adminRoleCOnfig,
	}),
);
router.use(
	'/repos',
	defineRoutes({
		Model: Project,
		settings: projectSettings,
		permission: 'adminrole',
		customRoutes: [
			{
				path: '/:id/hosting',
				method: 'put',
				controller: setRepoHosting,
				middlewares: [adminProtect, adminPermissions(['edit-adminrole'])],
				description: 'Link a repo to a Vercel or Heroku project, or clear the link',
			},
		],
	}),
);

router.use(
	'/clients',
	defineRoutes({ Model: Client, settings: clientSettings, permission: 'client' }),
);

router.use(
	'/documents',
	defineRoutes({
		Model: Doc,
		settings: docSettings,
		permission: 'documents',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/jobposts',
	defineRoutes({
		Model: JobPost,
		settings: jobPostSettings,
		permission: 'jobposts',
	}),
);

router.use(
	'/jobapplications',
	defineRoutes({
		Model: JobApplication,
		settings: jobApplicationSettings,
		permission: 'jobapplications',
	}),
);

router.use(
	'/meetings',
	defineRoutes({
		Model: Meeting,
		settings: meetingSettings,
		permission: 'meetings',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/invoices',
	defineRoutes({
		Model: AdminInvoice,
		settings: adminInvoiceSettings,
		permission: 'invoices',
		route: 'invoices',
		frontendConfig: adminInvoiceConfig,
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
		customRoutes: [
			{
				path: '/:id/pdf',
				method: 'get',
				controller: downloadInvoicePdf,
				middlewares: [adminProtect],
				description: 'Download an invoice/bill/receipt as PDF',
			},
			{
				path: '/public/:id',
				method: 'get',
				controller: getPublicInvoice,
				middlewares: [],
				description: 'Public read-only view of an invoice/bill/receipt (no auth) — the shareable client link',
			},
		],
	}),
);

router.use(
	'/employees',
	defineRoutes({
		Model: Employee,
		settings: employeeSettings,
		permission: 'employee',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/leaves',
	defineRoutes({
		Model: Leave,
		settings: leaveSettings,
		permission: 'leaves',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/projects',
	defineRoutes({
		Model: Software,
		settings: softwareSettings,
		permission: 'softwares',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/teams',
	defineRoutes({
		Model: TeamMember,
		settings: teamMemberSettings,
		permission: 'teams',
	}),
);

router.use(
	'/portfolios',
	defineRoutes({
		Model: Portfolio,
		settings: portfolioSettings,
		permission: 'portfolios',
	}),
);

router.use(
	'/services',
	defineRoutes({
		Model: Service,
		settings: serviceSettings,
		permission: 'services',
	}),
);

router.use(
	'/issues',
	defineRoutes({
		Model: Issue,
		settings: issueSettings,
		permission: 'issues',
	}),
);

router.use(
	'/resources',
	defineRoutes({
		Model: Resource,
		settings: resourceSettings,
		permission: 'resources',
	}),
);

router.use(
	'/maintenances',
	defineRoutes({
		Model: Maintenance,
		settings: maintenanceSettings,
		permission: 'maintenances',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/expenses',
	defineRoutes({
		Model: AdminExpense,
		settings: adminExpenseSettings,
		permission: 'expenses',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/components',
	defineRoutes({
		Model: Component,
		settings: componentSettings,
		permission: 'components',
	}),
);

router.use(
	'/props',
	defineRoutes({
		Model: Prop,
		settings: propSettings,
		permission: 'props',
	}),
);

router.use(
	'/plannedmodels',
	defineRoutes({
		Model: PlannedModel,
		settings: plannedModelSettings,
		permission: 'plans',
	}),
);
router.use(
	'/plannedprojects',
	defineRoutes({
		Model: PlannedProject,
		settings: plannedProjectSettings,
		permission: 'plans',
	}),
);
router.use(
	'/plannedfeatures',
	defineRoutes({
		Model: PlannedFeature,
		settings: plannedFeatureSettings,
		permission: 'plans',
	}),
);
router.use(
	'/plannedpages',
	defineRoutes({
		Model: PlannedPage,
		settings: plannedPageSettings,
		permission: 'plans',
	}),
);

router.use(
	'/modelattributes',
	defineRoutes({
		Model: ModelAttributes,
		settings: modelAttributesSettings,
		permission: 'plans',
	}),
);

router.use(
	'/billsubscriptions',
	defineRoutes({
		Model: BillSubscription,
		settings: billSubscriptionSettings,
		permission: 'subscriptions',
	}),
);

router.use(
	'/tcclients',
	defineRoutes({
		Model: TCClient,
		settings: tcClientSettings,
		permission: 'website',
	}),
);

router.use(
	'/bills',
	defineRoutes({
		Model: Bill,
		settings: billSettings,
		permission: 'bill',
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/emails',
	defineRoutes({
		Model: Email,
		settings: emailSettings,
		permission: 'email',
	}),
);

router.use(
	'/offers',
	defineRoutes({
		Model: Offer,
		settings: offerSettings,
		permission: 'email',
	}),
);

router.use(
	'/features',
	defineRoutes({
		Model: Feature,
		settings: featureSettings,
		permission: 'email',
	}),
);

router.use(
	'/solutions',
	defineRoutes({
		Model: Solution,
		settings: solutionSettings,
		permission: 'email',
	}),
);

router.use(
	'/techstacks',
	defineRoutes({
		Model: TechStack,
		settings: techStackSettings,
		permission: 'email',
	}),
);

router.use(
	'/servicecategories',
	defineRoutes({
		Model: ServiceCategory,
		settings: serviceCategorySettings,
		permission: 'email',
	}),
);

router.use(
	'/blogs',
	defineRoutes({
		Model: Blog,
		settings: blogSettings,
		permission: 'email',
		frontendConfig: blogConfig,
	}),
);

router.use(
	'/authors',
	defineRoutes({
		Model: Author,
		settings: authorSettings,
		permission: 'email',
	}),
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
	}),
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
	}),
);

router.use(
	'/npmlibraries',
	defineRoutes({
		Model: NpmLibrary,
		settings: npmLibrarySettings,
		permission: 'email',
	}),
);

router.use(
	'/sidebarcategories',
	defineRoutes({
		Model: SidebarCategory,
		settings: sidebarCategorySettings,
		permission: 'sidebarcategories',
		route: 'sidebarcategories',
		frontendConfig: sidebarCategoryConfig,
	}),
);

router.use(
	'/sidebaritems',
	defineRoutes({
		Model: SidebarItem,
		settings: sidebarItemSettings,
		permission: 'sidebaritems',
		route: 'sidebaritems',
		frontendConfig: sidebarItemConfig,
	}),
);

router.use(
	'/files',
	defineRoutes({
		Model: AdminFile,
		settings: adminFileSettings,
		permission: 'files',
		route: 'files',
		frontendConfig: adminFileConfig,
		replaceController: {
			delete: deleteMedia(AdminFile),
		},
	}),
);

router.use(
	'/vacancies',
	defineRoutes({
		Model: Vacancy,
		settings: vacancySettings,
		permission: 'vacancy',
		route: 'vacancies',
		frontendConfig: vacancyConfig,
	}),
);

router.use(
	'/contents',
	defineRoutes({
		Model: Content,
		settings: contentSettings,
		permission: 'content',
		route: 'contents',
		frontendConfig: contentConfig,
	}),
);

router.use(
	'/paymentmethods',
	defineRoutes({
		Model: PaymentMethod,
		settings: paymentMethodSettings,
		permission: 'paymentmethods',
		route: 'paymentmethods',
		frontendConfig: paymentMethodConfig,
	}),
);

router.use(
	'/images',
	defineRoutes({
		Model: AdminFile,
		settings: imageSettings,
		permission: 'image',
		route: 'images',
		frontendConfig: imageConfig,
		injectMiddleware: { getAll: [customQuery({ query: { fileType: 'image' } })] },
		replaceController: {
			delete: deleteMedia(AdminFile),
		},
	}),
);

router.use(
	'/folders',
	defineRoutes({
		Model: Folder,
		settings: folderSettings,
		permission: 'folders',
		route: 'folders',
		frontendConfig: folderConfig,
	}),
);

// The audit trail. `settings` marks no field as editable, so the generic
// update route has nothing it is allowed to write — the log is append-only as
// far as the API is concerned, and entries are created by recordHistory()
// inside the CRUD controllers rather than by anything routed here.
router.use(
	'/history',
	defineRoutes({
		Model: History,
		settings: historySettings,
		permission: 'history',
		route: 'history',
		frontendConfig: historyConfig,
		customRoutes: [
			{
				path: '/g/document/:id',
				method: 'get',
				controller: getDocumentHistory,
				middlewares: [adminProtect],
				description: "One record's own activity timeline, newest first",
			},
		],
	}),
);

router.use(
	'/permissions',
	defineRoutes({
		Model: Permission,
		settings: permissionSettings,
		permission: 'permissions',
		route: 'permissions',
		frontendConfig: permissionConfig,
	}),
);

router.use(
	'/pages',
	defineRoutes({
		Model: Page,
		settings: pageSettings,
		permission: 'pages',
		frontendConfig: pageConfig,
		route: 'pages',
	}),
);

router.use(
	'/domains',
	defineRoutes({
		Model: Domain,
		settings: domainSettings,
		permission: 'domains',
		route: 'domains',
		frontendConfig: domainConfig,
	}),
);

router.use(
	'/socials',
	defineRoutes({
		Model: Social,
		settings: socialSettings,
		permission: 'socials',
		route: 'socials',
		frontendConfig: socialConfig,
	}),
);

router.use(
	'/metas',
	defineRoutes({
		Model: Meta,
		settings: metaSettings,
		permission: 'metas',
		route: 'metas',
		frontendConfig: metaConfig,
	}),
);

router.use(
	'/prospects',
	defineRoutes({
		Model: Prospect,
		settings: prospectSettings,
		permission: 'prospects',
		route: 'prospects',
		frontendConfig: prospectConfig,
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/hostings',
	defineRoutes({
		Model: Hosting,
		settings: hostingSettings,
		permission: 'hostings',
		route: 'hostings',
		frontendConfig: hostingConfig,
	}),
);

router.use(
	'/urls',
	defineRoutes({
		Model: URL,
		settings: urlSettings,
		permission: 'urls',
		route: 'urls',
		frontendConfig: urlConfig,
	}),
);

router.use(
	'/models',
	defineRoutes({
		Model: Model,
		settings: modelSettings,
		permission: 'models',
		frontendConfig: modelConfig,
		route: 'models',
		injectMiddleware: { post: [doesModelExist] },
	}),
);

router.use(
	'/tableconfigs',
	defineRoutes({
		Model: TableConfig,
		settings: tableConfigSettings,
		permission: 'models',
		frontendConfig: tableConfigConfig,
		route: 'tableconfigs',
	}),
);

router.use(
	'/formfields',
	defineRoutes({
		Model: FormField,
		settings: formFieldSettings,
		permission: 'models',
		frontendConfig: formFieldConfig,
		route: 'formfields',
	}),
);

router.use(
	'/configs',
	defineRoutes({
		Model: Config,
		settings: configSettings,
		permission: 'models',
		frontendConfig: configConfig,
		route: 'configs',
	}),
);

router.use(
	'/fieldconfigs',
	defineRoutes({
		Model: FieldConfig,
		settings: fieldConfigSettings,
		permission: 'models',
		frontendConfig: fieldConfigConfig,
		route: 'fieldconfigs',
	}),
);

router.use(
	'/formconfigs',
	defineRoutes({
		Model: FieldConfig,
		settings: fieldConfigSettings,
		permission: 'models',
		frontendConfig: fieldConfigConfig,
		route: 'fieldconfigs',
	}),
);

router.use(
	'/credentials',
	defineRoutes({
		Model: Credential,
		settings: credentialSettings,
		permission: 'credentials',
		route: 'credentials',
		frontendConfig: credentialConfig,
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
	}),
);

router.use(
	'/herokus',
	defineRoutes({
		Model: HerokuAccount,
		settings: herokuSettings,
		permission: 'heroku',
		route: 'herokus',
		frontendConfig: herokuConfig,
		replaceController: { post: createHerokuAccount },
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
		customRoutes: [
			{
				path: '/verify',
				method: 'post',
				controller: verifyHerokuKey,
				middlewares: [adminProtect, adminPermissions(['create-heroku'])],
				description: 'Pre-flight check a Heroku API key before connecting an account',
			},
			{
				path: '/:id/key',
				method: 'put',
				controller: updateHerokuKey,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Rotate a stored Heroku account key',
			},
			{
				path: '/:id/account',
				method: 'get',
				controller: getHerokuAccount,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'Live Heroku account snapshot + rate limit',
			},
			{
				path: '/:id/apps',
				method: 'get',
				controller: getHerokuApps,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'List apps visible to a Heroku account',
			},
			{
				path: '/:id/apps/:app',
				method: 'get',
				controller: getHerokuApp,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'One Heroku app detail',
			},
			{
				path: '/:id/apps/:app/config-vars',
				method: 'get',
				controller: getHerokuConfigVars,
				middlewares: [adminProtect, adminPermissions(['view-heroku-config'])],
				description: 'Read an app config vars',
			},
			{
				path: '/:id/apps/:app/config-vars/download',
				method: 'get',
				controller: downloadHerokuConfigVars,
				// No dedicated 'download' slot on the Permission model (create/view/edit/
				// delete only), so 'create-heroku-config' stands in. The verb itself cannot
				// be relabelled — getAdminPermissionList builds each label as
				// `"<Verb> " + permission.name` — so the seeded Permission doc is named
				// 'Heroku Config Download' and the Role UI reads "Create Heroku Config
				// Download".
				middlewares: [adminProtect, adminPermissions(['create-heroku-config'])],
				description: 'Download an app config vars as .env or .json',
			},
			{
				path: '/:id/apps/:app/config-vars',
				method: 'patch',
				controller: updateHerokuConfigVars,
				middlewares: [adminProtect, adminPermissions(['edit-heroku-config'])],
				description: 'Set or delete app config vars (restarts the app)',
			},

			//Account-level reads
			{
				path: '/:id/billing',
				method: 'get',
				controller: getHerokuBilling,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'Heroku invoices for an account or team',
			},
			{
				path: '/:id/usage',
				method: 'get',
				controller: getHerokuUsage,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'Monthly dyno and add-on usage',
			},
			{
				path: '/:id/activity',
				method: 'get',
				controller: getHerokuActivity,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'Audit feed for an account, optionally one app',
			},

			//Deploys
			{
				path: '/:id/apps/:app/current-release',
				method: 'get',
				controller: getHerokuCurrentRelease,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'The release currently serving traffic',
			},
			{
				path: '/:id/apps/:app/releases',
				method: 'get',
				controller: getHerokuReleases,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'Release history, Range-paginated',
			},
			{
				path: '/:id/apps/:app/releases/:version/rollback',
				method: 'post',
				controller: rollbackHerokuRelease,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Re-release the slug behind a past release',
			},
			{
				path: '/:id/apps/:app/redeploy',
				method: 'post',
				controller: redeployHerokuApp,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Re-release the current slug',
			},
			{
				path: '/:id/apps/:app/builds',
				method: 'get',
				controller: getHerokuBuilds,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'Build history',
			},
			{
				path: '/:id/apps/:app/builds',
				method: 'post',
				controller: createHerokuBuild,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Build and release from a source tarball URL',
			},

			//Dynos and scaling
			{
				path: '/:id/apps/:app/dynos',
				method: 'get',
				controller: getHerokuDynos,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'Formation and running dynos',
			},
			{
				path: '/:id/apps/:app/restart',
				method: 'post',
				controller: restartHerokuApp,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Restart every dyno',
			},
			{
				path: '/:id/apps/:app/dynos/:dyno/restart',
				method: 'post',
				controller: restartHerokuDyno,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Restart one dyno',
			},
			{
				path: '/:id/apps/:app/formation',
				method: 'patch',
				controller: updateHerokuFormation,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Scale process types (bills immediately)',
			},

			//App administration
			{
				path: '/:id/apps/:app/maintenance',
				method: 'patch',
				controller: setHerokuMaintenance,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Toggle maintenance mode',
			},
			{
				path: '/:id/apps/:app/rename',
				method: 'patch',
				controller: renameHerokuApp,
				middlewares: [adminProtect, adminPermissions(['edit-heroku'])],
				description: 'Rename an app (breaks its old URL and git remote)',
			},
			{
				path: '/:id/apps/:app',
				method: 'delete',
				controller: destroyHerokuApp,
				middlewares: [adminProtect, adminPermissions(['delete-heroku'])],
				description: 'Permanently delete an app — requires a typed confirmation',
			},

			//Resources and logs
			{
				path: '/:id/apps/:app/resources',
				method: 'get',
				controller: getHerokuAppResources,
				middlewares: [adminProtect, adminPermissions(['view-heroku'])],
				description: 'Add-ons, domains and collaborators',
			},
			{
				// `view-heroku-config`, not `view-heroku`: applications print tokens and
				// connection strings to stdout routinely, so reading logs is reading
				// secrets. Same privilege as the config vars themselves.
				path: '/:id/apps/:app/logs',
				method: 'get',
				controller: getHerokuLogs,
				middlewares: [adminProtect, adminPermissions(['view-heroku-config'])],
				description: 'Recent log lines',
			},
		],
	}),
);

router.use(
	'/vercels',
	defineRoutes({
		Model: VercelAccount,
		settings: vercelSettings,
		permission: 'vercel',
		route: 'vercels',
		frontendConfig: vercelConfig,
		replaceController: { post: createVercelAccount },
		injectMiddleware: { getAll: [hasAccess()], getById: [hasAccess()], export: [hasAccess()] },
		// Every route below accepts an optional `?team=`, falling back to the
		// account's defaultTeamId. On a personal account both are empty, and an
		// absent teamId is the correct scope rather than a fallback.
		customRoutes: [
			{
				path: '/verify',
				method: 'post',
				controller: verifyVercelToken,
				middlewares: [adminProtect, adminPermissions(['create-vercel'])],
				description: 'Pre-flight check a Vercel API token before connecting an account',
			},
			{
				path: '/:id/key',
				method: 'put',
				controller: updateVercelToken,
				middlewares: [adminProtect, adminPermissions(['edit-vercel'])],
				description: 'Rotate a stored Vercel account token',
			},

			//Account-level reads
			{
				path: '/:id/account',
				method: 'get',
				controller: getVercelAccount,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'Live Vercel account snapshot, teams and rate budget',
			},
			{
				path: '/:id/teams',
				method: 'get',
				controller: getVercelTeams,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'Teams this token can see; empty on a personal account',
			},
			{
				path: '/:id/activity',
				method: 'get',
				controller: getVercelActivity,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'Audit feed for a Vercel account or one of its projects',
			},
			{
				path: '/:id/usage',
				method: 'get',
				controller: getVercelUsage,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'Build counts and build minutes derived from the deployment list',
			},
			{
				path: '/:id/resources',
				method: 'get',
				controller: getVercelAccountResources,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'Account resource rollup: which project uses what, and what nothing uses',
			},

			//Projects
			{
				path: '/:id/projects',
				method: 'get',
				controller: getVercelProjects,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'List projects visible to a Vercel account',
			},
			{
				path: '/:id/projects',
				method: 'post',
				controller: createVercelProject,
				middlewares: [adminProtect, adminPermissions(['create-vercel'])],
				description: 'Create a Vercel project, optionally linked to a git repository',
			},
			{
				path: '/:id/projects/:project',
				method: 'get',
				controller: getVercelProject,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'One Vercel project detail',
			},
			{
				path: '/:id/projects/:project',
				method: 'patch',
				controller: updateVercelProject,
				middlewares: [adminProtect, adminPermissions(['edit-vercel'])],
				description: 'Update a project build configuration',
			},
			{
				path: '/:id/projects/:project',
				method: 'delete',
				controller: deleteVercelProject,
				middlewares: [adminProtect, adminPermissions(['delete-vercel'])],
				description: 'Delete a Vercel project; refused outright for a shop storefront',
			},
			{
				path: '/:id/projects/:project/resources',
				method: 'get',
				controller: getVercelProjectResources,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'Stores, integrations, domains and drains used by one project',
			},

			//Environment variables. These are live secrets, so they sit behind
			//their own permission key rather than the general view-vercel one.
			{
				path: '/:id/projects/:project/env',
				method: 'get',
				controller: getVercelEnv,
				middlewares: [adminProtect, adminPermissions(['view-vercel-env'])],
				description: 'Read a project environment variables',
			},
			{
				path: '/:id/projects/:project/env/download',
				method: 'get',
				controller: downloadVercelEnv,
				// No dedicated 'download' slot on the Permission model (create/view/
				// edit/delete only), so 'create-vercel-env' stands in. The verb itself
				// cannot be relabelled — getAdminPermissionList builds each label as
				// `"<Verb> " + permission.name` — so the seeded Permission doc is named
				// 'Vercel Env Download' and the Role UI reads "Create Vercel Env
				// Download".
				middlewares: [adminProtect, adminPermissions(['create-vercel-env'])],
				description: 'Download a project environment as .env (per target) or .json',
			},
			{
				path: '/:id/projects/:project/env/:envId',
				method: 'get',
				controller: revealVercelEnv,
				// Same gate as reading the list: this is the only endpoint that
				// returns a plaintext value, one variable at a time.
				middlewares: [adminProtect, adminPermissions(['view-vercel-env'])],
				description: 'Reveal one environment variable value',
			},
			{
				path: '/:id/projects/:project/env',
				method: 'post',
				controller: updateVercelEnv,
				middlewares: [adminProtect, adminPermissions(['edit-vercel-env'])],
				description: 'Commit a staged batch of environment changes',
			},

			//Deployments
			{
				path: '/:id/projects/:project/deployments',
				method: 'get',
				controller: getVercelDeployments,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'List deployments for a project',
			},
			{
				path: '/:id/projects/:project/deploy',
				method: 'post',
				controller: createVercelDeployment,
				middlewares: [adminProtect, adminPermissions(['edit-vercel'])],
				description: 'Deploy a git ref, or redeploy an existing deployment',
			},
			{
				path: '/:id/projects/:project/promote/:deployment',
				method: 'post',
				controller: promoteVercelDeployment,
				middlewares: [adminProtect, adminPermissions(['edit-vercel'])],
				description: 'Promote an existing deployment to production (the rollback path)',
			},
			{
				path: '/:id/deployments/:deployment',
				method: 'get',
				controller: getVercelDeployment,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'One deployment, with its checks and aliases',
			},
			{
				path: '/:id/deployments/:deployment/cancel',
				method: 'patch',
				controller: cancelVercelDeployment,
				middlewares: [adminProtect, adminPermissions(['edit-vercel'])],
				description: 'Cancel a running build',
			},
			{
				path: '/:id/deployments/:deployment',
				method: 'delete',
				controller: deleteVercelDeployment,
				middlewares: [adminProtect, adminPermissions(['delete-vercel'])],
				description: 'Delete a deployment; refused for the live production one',
			},
			{
				path: '/:id/deployments/:deployment/events',
				method: 'get',
				controller: getVercelBuildLogs,
				// Build output routinely contains environment values, tokens and
				// connection strings, so reading it is reading the environment.
				// Gated on view-vercel-env, not view-vercel, for that reason.
				middlewares: [adminProtect, adminPermissions(['view-vercel-env'])],
				description: 'Build logs for one deployment',
			},

			//Domains
			{
				path: '/:id/projects/:project/domains',
				method: 'get',
				controller: getVercelDomains,
				middlewares: [adminProtect, adminPermissions(['view-vercel'])],
				description: 'Project domains, with the DNS records for unverified ones',
			},
			{
				path: '/:id/projects/:project/domains',
				method: 'post',
				controller: addVercelDomain,
				middlewares: [adminProtect, adminPermissions(['edit-vercel'])],
				description: 'Attach a domain to a project',
			},
			{
				path: '/:id/projects/:project/domains/:domain/verify',
				method: 'post',
				controller: verifyVercelDomain,
				middlewares: [adminProtect, adminPermissions(['edit-vercel'])],
				description: 'Ask Vercel to re-check a domain verification record',
			},
			{
				path: '/:id/projects/:project/domains/:domain',
				method: 'delete',
				controller: removeVercelDomain,
				middlewares: [adminProtect, adminPermissions(['edit-vercel'])],
				description: 'Detach a domain from a project',
			},
		],
	}),
);

router.use(
	'/setting',
	defineRoutes({
		Model: Setting,
		settings: settingSettings,
		permission: 'models',
		route: 'setting',
		frontendConfig: settingConfig,
	}),
);

// The signed-in admin's notifications, and who a record can be shared with.
router.use('/notifications', notificationsRouter);
router.use('/access-users', accessUsersRouter);

// Models built in the model builder. Last, so it only ever sees paths no code
// route answered — and a built model can't take a name one of them uses.
router.use(dynamicModelsDispatcher);

export default router;
