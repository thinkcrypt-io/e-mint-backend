import mongoose from 'mongoose';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import Organization from '../models/tenancy/organization.model.js';
import SidebarCategory from '../models/sidebarcategories/model.js';
import SidebarItem from '../models/sidebaritems/model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
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
import AdminFile from '../models/admin-file/model.js';
import Folder from '../models/folders/model.js';
import { deleteS3ObjectIfUnused } from '../../routes-admin/file/media.helpers.js';
import { runInScope } from './tenantScope.function.js';
import { settleProjectModels } from './dynamicModels.function.js';
import { PANEL_PAGES, uniqueSlug } from './tenancy.function.js';
import { projectHooks } from './projectHooks.function.js';
// Registers the website kit on projectHooks (a website project is seeded with it — WO-18).
import './websiteKit.function.js';
import ProjectWebhook from '../models/tenancy/projectWebhook.model.js';
import WebhookDelivery from '../models/tenancy/webhookDelivery.model.js';
import ApiCall from '../models/tenancy/apiCall.model.js';

/**
 * Making and removing a tenant project — one place for the projects router
 * (docs/multi-tenancy WO-07) and the template sandbox (docs/templates T-04),
 * so a preview project is made exactly like a tenant's.
 */

/** The project's own documents in the scoped collections. */
const SCOPED = [
	ModelDefinition,
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
	ProjectWebhook,
	WebhookDelivery,
	ApiCall,
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
	for (const f of files) await deleteS3ObjectIfUnused(f.key, f.bucket).catch((e: any) => console.error('project delete, S3:', e?.message));
	// Its built models' data: t_<projectId>_<route> (README, Naming) — once their index builds are done.
	await settleProjectModels(projectId);
	const db = mongoose.connection.db!;
	const prefix = `t_${projectId}_`;
	const collections = await db.listCollections({ name: { $regex: `^${prefix}` } }, { nameOnly: true }).toArray();
	for (const c of collections) await db.dropCollection(c.name).catch(() => undefined);
	await projectHooks.removed(projectId);
};

/**
 * A new project in `organization`: unique slug and publicSlug, an empty first
 * sidebar section and dashboard in its own scope, then what its type brings
 * (projectHooks — the website kit). Anything failing removes it again.
 */
export const createProject = async (req: any, organization: any, body: { name: string; type: string; [k: string]: any }, extra: Record<string, any> = {}) => {
	const org: any = await Organization.findById(organization, { slug: 1 }).lean();
	const slug = await uniqueSlug(body.name, s => TenantProject.exists({ organization, slug: s }));
	// The tenant panel's addresses start with it (/<publicSlug>/<page>): never one of the panel's own pages.
	const publicSlug = await uniqueSlug(`${org.slug}-${slug}`, async s => PANEL_PAGES.has(s) || TenantProject.exists({ publicSlug: s }));
	const project: any = await TenantProject.create({ ...body, ...extra, slug, publicSlug, organization });
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
