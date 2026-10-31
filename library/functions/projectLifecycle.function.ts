import mongoose from 'mongoose';
import { orgBusiness } from './business.function.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import Organization from '../models/tenancy/organization.model.js';
import SidebarCategory from '../models/sidebarcategories/model.js';
import SidebarItem from '../models/sidebaritems/model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import ComponentDefinition from '../models/builder/componentDefinition.model.js';
import RouteSettings from '../models/builder/routeSettings.model.js';
import RouteConfig from '../models/builder/routeConfig.model.js';
import RouteVersion from '../models/builder/routeVersion.model.js';
import DashboardConfig from '../models/builder/dashboardConfig.model.js';
import ApiKey from '../models/builder/apiKey.model.js';
import BuiltFeature from '../models/builder/feature.model.js';
import ProjectCustomer from '../models/tenancy/projectCustomer.model.js';
import WebsiteEvent from '../models/tenancy/websiteEvent.model.js';
import WebsiteSettings from '../models/tenancy/websiteSettings.model.js';
import History from '../models/history/model.js';
import RecordComment from '../models/tenancy/recordComment.model.js';
import Automation from '../models/tenancy/automation.model.js';
import AutomationRun from '../models/tenancy/automationRun.model.js';
import ApiEndpoint from '../models/tenancy/apiEndpoint.model.js';
import ServerKey from '../models/tenancy/serverKey.model.js';
import AdminFile from '../models/admin-file/model.js';
import Folder from '../models/folders/model.js';
import { deleteS3ObjectIfUnused } from '../../routes-admin/file/media.helpers.js';
import { runInScope } from './tenantScope.function.js';
import { settleProjectModels } from './dynamicModels.function.js';
import { PANEL_PAGES, uniqueSlug } from './tenancy.function.js';
import { projectHooks } from './projectHooks.function.js';
import { newProjectKey } from './projectKey.function.js';
// Registers the website kit on projectHooks (a website project is seeded with it — WO-18).
import './websiteKit.function.js';
// …and the site builder's starter design and home page (docs/site-builder SB-03).
import '../siteBuilder/site.js';
import ProjectWebhook from '../models/tenancy/projectWebhook.model.js';
import WebhookDelivery from '../models/tenancy/webhookDelivery.model.js';
import ApiCall from '../models/tenancy/apiCall.model.js';
import SiteWidgets from '../models/tenancy/siteWidgets.model.js';
import SiteCart from '../models/tenancy/siteCart.model.js';
import SitePayment from '../models/tenancy/sitePayment.model.js';
import SitePaymentSettings from '../models/tenancy/sitePaymentSettings.model.js';
import CourierConnection from '../models/tenancy/courierConnection.model.js';
import CourierWebhookEvent from '../models/tenancy/courierEvent.model.js';
import CourierAreaMap from '../models/tenancy/courierAreaMap.model.js';
import MailAccount from '../models/tenancy/mailAccount.model.js';
import MailDesign from '../models/tenancy/mailDesign.model.js';
import DeletedRecord from '../models/deleted-record/model.js';
import ContentSchedule from '../models/tenancy/contentSchedule.model.js';
import CommerceSettings from '../models/tenancy/commerceSettings.model.js';

/**
 * Making and removing a tenant project — one place for the projects router
 * (docs/multi-tenancy WO-07) and the template sandbox (docs/templates T-04),
 * so a preview project is made exactly like a tenant's.
 */

/**
 * The project's own documents in the scoped collections — every tenantScoped
 * model (organization-level documents have no `project`, so the scoped
 * deleteMany never reaches them). The site builder's SitePage, SiteDesign and
 * SiteRelease go in its projectHooks.onRemoved (siteBuilder/site.ts).
 * Payments go too: their orders are in t_<projectId>, dropped below, and the
 * organization's own merchant account keeps the financial record (WD6).
 */
const SCOPED = [
	ModelDefinition,
	ComponentDefinition,
	RouteSettings,
	RouteConfig,
	RouteVersion,
	SidebarItem,
	SidebarCategory,
	DashboardConfig,
	ApiKey,
	BuiltFeature,
	ProjectCustomer,
	Folder,
	WebsiteEvent,
	WebsiteSettings,
	History,
	// Comments on its records (WO-49).
	RecordComment,
	// Its automations and their runs (docs/automations).
	Automation,
	AutomationRun,
	ProjectWebhook,
	WebhookDelivery,
	ApiCall,
	// Its public API's endpoints and server keys (docs/api-builder).
	ApiEndpoint,
	ServerKey,
	DeletedRecord,
	SiteWidgets,
	SiteCart,
	SitePayment,
	// Holds the sealed Stripe secret key and webhook secret.
	SitePaymentSettings,
	// Its records' scheduled publishes (docs/cms CMS-11).
	ContentSchedule,
	// An e-commerce project's store settings (docs/ecommerce EC2).
	CommerceSettings,
	// Its couriers' sealed keys and webhook secrets (docs/couriers CR3).
	CourierConnection,
	// What its couriers' webhooks sent (docs/couriers CR-06).
	CourierWebhookEvent,
	// Its remembered courier areas (docs/couriers CR-10).
	CourierAreaMap,
];

/** Every document and collection the project holds (not the TenantProject itself). */
export const removeProjectContents = async (organization: any, projectId: any) => {
	// Its uploaded files: the records, then each S3 object no other scope uses.
	const files: any[] = await runInScope({ organization, project: projectId }, async () => {
		const list = await AdminFile.find({}, { key: 1, bucket: 1 }).lean();
		await AdminFile.deleteMany({});
		for (const Model of SCOPED) await (Model as any).deleteMany({});
		return list;
	});
	// Its email accounts (docs/messaging M-14) — they hold sealed passwords. Not tenantScoped: filtered by project.
	// Its sends stay in the organization's log (subject only, 180 days).
	await MailAccount.deleteMany({ project: projectId });
	await MailDesign.deleteMany({ project: projectId });
	for (const f of files) await deleteS3ObjectIfUnused(f.key, f.bucket).catch((e: any) => console.error('project delete, S3:', e?.message));
	// Its built models' data: t_<projectId> (D21), and t_<projectId>_<route> from
	// before WO-43 (README, Naming) — once their index builds are done.
	await settleProjectModels(projectId);
	const db = mongoose.connection.db!;
	const collections = await db.listCollections({ name: { $regex: `^t_${projectId}(_|$)` } }, { nameOnly: true }).toArray();
	for (const c of collections) await db.dropCollection(c.name).catch(() => undefined);
	await projectHooks.removed(projectId);
};

/**
 * A new project in `organization`: unique slug and publicSlug, an empty first
 * sidebar section and dashboard in its own scope, then what its type brings
 * (projectHooks — the website kit). Anything failing removes it again.
 */
export const createProject = async (req: any, organization: any, body: { name: string; type: string; [k: string]: any }, extra: Record<string, any> = {}) => {
	const org: any = await Organization.findById(organization, { slug: 1, name: 1, logo: 1, business: 1, onboarding: 1 }).lean();
	const slug = await uniqueSlug(body.name, s => TenantProject.exists({ organization, slug: s }));
	// The tenant panel's addresses start with it (/<publicSlug>/<page>): never one of the panel's own pages.
	const publicSlug = await uniqueSlug(`${org.slug}-${slug}`, async s => PANEL_PAGES.has(s) || TenantProject.exists({ publicSlug: s }));
	// Its business details start as the organization's (docs/pdf-templates D14).
	// Its key names it on the public API (docs/api-builder D14).
	const project: any = await TenantProject.create({ business: orgBusiness(org), ...body, ...extra, slug, publicSlug, organization, apiKey: newProjectKey() });
	try {
		await runInScope({ organization, project: project._id }, async () => {
			await SidebarCategory.create({
				name: body.type === 'website' ? 'Website' : body.type === 'api' ? 'Data' : 'Pages',
				priority: 100,
				icon: body.type === 'website' ? 'globe' : body.type === 'api' ? 'database' : 'layout-grid',
				isActive: true,
			});
			await DashboardConfig.create({ key: 'default', widgets: [] });
		});
		await projectHooks.created(req, project);
		return project;
	} catch (e) {
		await removeProjectContents(organization, project._id).catch(() => undefined);
		await TenantProject.deleteOne({ _id: project._id });
		throw e;
	}
};
