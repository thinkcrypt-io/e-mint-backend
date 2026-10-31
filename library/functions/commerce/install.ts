import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import RouteSettings from '../../models/builder/routeSettings.model.js';
import CommerceSettings from '../../models/tenancy/commerceSettings.model.js';
import SidebarCategory from '../../models/sidebarcategories/model.js';
import SidebarItem from '../../models/sidebaritems/model.js';
import { Feature } from '../../models/builder/_index.js';
import { BuildError, deleteModelCore } from '../../controllers/builder/models.controller.js';
import { TEMPLATE_MAX_STEPS, buildFeature } from '../../controllers/builder/features.service.js';
import { planFromAi } from '../../controllers/builder/features.schema.js';
import { compiledModel, syncDynamicModels } from '../dynamicModels.function.js';
import { invalidateRoute } from '../resolveRoute.function.js';
import { recordProjectEvent } from '../recordHistory.function.js';
import { runInScope } from '../tenantScope.function.js';
import { TenancyError } from '../tenancy.function.js';
import { Answers, checkAll, commerceView, loadCommerce, offeredFor } from './settings.js';
import { ModelKey, coreFieldsOf, modelSpecs, storePlan } from './blueprint.js';
import { seedStoreDashboard } from './dashboard.js';
import { ensureDeliveryAutomations } from './deliveryAutomations.js';

/**
 * Setting up a store (docs/ecommerce EC3): the blueprint's models built as one
 * feature plan in the background, marked as the store's (EC4), the engine's
 * fields made read-only in forms (EC5), the E-commerce sidebar category
 * showing what the answers turn on, and the first records — outlets, tax
 * rates, a register per store. All or nothing: a failure takes back what was
 * done and leaves the store `failed` with why, ready to try again.
 */

export type Installed = Partial<Record<ModelKey, { name: string; route: string; id: string }>>;

const scopeOf = (project: any) => ({ organization: project.organization, project: project._id });

/** The features the answers turn on — what the sidebar shows and the engine does. */
export const featuresOf = (a: Answers): string[] =>
	[
		a.products.variations && 'variations',
		a.products.brands && 'brands',
		a.products.barcodes && 'barcodes',
		a.pos.tax.mode !== 'none' && 'tax',
		a.pos.coupons && 'coupons',
		a.pos.discounts && 'discounts',
		a.pos.shifts && 'shifts',
		a.pos.held && 'held',
		a.returns.allowed && 'returns',
		a.returns.storeCredit && 'store-credit',
		a.delivery.enabled && 'delivery',
	].filter(Boolean) as string[];

/** Sidebar icons for the store's pages. */
const ICONS: Record<ModelKey, string> = {
	outlet: 'store',
	category: 'folder-tree',
	brand: 'badge',
	taxRate: 'percent',
	product: 'package',
	variant: 'layers',
	stock: 'warehouse',
	movement: 'arrow-left-right',
	adjustment: 'clipboard-pen',
	transfer: 'truck',
	customer: 'users',
	coupon: 'ticket-percent',
	register: 'monitor-smartphone',
	shift: 'clock',
	order: 'receipt',
	payment: 'wallet',
	return: 'undo-2',
	credit: 'piggy-bank',
	delivery: 'package-check',
};

/**
 * The E-commerce sidebar: what the answers turn on, in the blueprint's order,
 * Orders and Returns left to the Store section's own pages (EC19).
 */
export const applySidebar = async (a: Answers, installed: Installed) => {
	const specs = modelSpecs(a);
	for (const [i, s] of specs.entries()) {
		const m = installed[s.key];
		if (!m) continue;
		const def: any = await ModelDefinition.findById(m.id, { sidebarItem: 1 }).lean();
		if (!def?.sidebarItem) continue;
		const shown = !s.ownPage && (!s.shownWhen || s.shownWhen(a));
		await SidebarItem.updateOne({ _id: def.sidebarItem }, { $set: { isActive: shown, priority: (specs.length - i) * 10, icon: ICONS[s.key] } });
	}
};

/** The engine's fields can't be edited in the plain forms (EC5): their settings' `edit` off, in the published copy and any draft. */
export const engineFieldsReadOnly = async (route: string, keys: string[]) => {
	if (!keys.length) return;
	const doc: any = await RouteSettings.findOne({ route }, { data: 1, draft: 1 }).lean();
	if (!doc) return;
	for (const copy of ['data', 'draft'] as const) {
		const fields = doc[copy]?.fields;
		if (!Array.isArray(fields) || !fields.some((f: any) => keys.includes(f?.key) && f.edit !== false)) continue;
		await RouteSettings.updateOne({ _id: doc._id }, { $set: { [`${copy}.fields.$[f].edit`]: false } }, { arrayFilters: [{ 'f.key': { $in: keys } }] });
	}
	invalidateRoute(route);
};

/** The first records: the wizard's outlets, its tax rates, a register at each store. */
const seed = async (a: Answers, installed: Installed) => {
	const model = (k: ModelKey) => (installed[k] ? compiledModel(installed[k]!.name) : null);
	const Outlet: any = model('outlet');
	const outlets: any[] = [];
	for (const o of a.outlets)
		outlets.push(await Outlet.create({ name: o.name, outletCode: o.code, kind: o.kind, active: true, ...(o.phone && { phone: o.phone }), ...(o.address && { address: o.address }) }));
	const Tax: any = model('taxRate');
	for (const t of a.pos.tax.mode === 'none' ? [] : a.pos.tax.rates) await Tax.create({ name: t.name, rate: t.rate, isDefault: !!t.default });
	const Register: any = model('register');
	for (const o of outlets.filter(o => o.kind === 'store')) await Register.create({ name: `${o.name} till`, outlet: o._id, active: true });
};

/** Builds the store; throws a BuildError (with problems) after undoing what it did. */
export const install = async (req: any, project: any, a: Answers): Promise<{ installed: Installed; features: string[] }> => {
	const undo: (() => Promise<any>)[] = [];
	try {
		const top: any = await SidebarCategory.findOne({}, { priority: 1 }).sort({ priority: -1 }).lean();
		const category: any = await SidebarCategory.create({
			name: 'E-commerce',
			description: 'Your store’s products, stock, customers and money',
			icon: 'shopping-bag',
			priority: (top?.priority || 100) + 10,
			isActive: true,
		});
		undo.push(() => SidebarCategory.deleteOne({ _id: category._id }));

		const specs = modelSpecs(a);
		const built = await buildFeature(req, planFromAi(storePlan(a, String(category._id))), { source: 'template', maxSteps: TEMPLATE_MAX_STEPS });
		undo.push(async () => {
			for (const m of [...built.created].reverse()) await deleteModelCore(req, m.id, { dropData: true, ignoreLinks: true, system: true }).catch(() => undefined);
			if (built.feature?._id) await Feature.deleteOne({ _id: built.feature._id });
		});

		const installed: Installed = {};
		for (const s of specs) {
			const m = built.created.find(c => c.title === s.step.title);
			if (!m) throw new BuildError(500, `${s.step.title} wasn’t built`);
			installed[s.key] = { name: m.name, route: m.route, id: m.id };
			await ModelDefinition.updateOne({ _id: m.id }, { $set: { system: 'commerce', systemFields: coreFieldsOf(s.step) } });
			await engineFieldsReadOnly(m.route, s.engine);
		}

		await applySidebar(a, installed);
		await seed(a, installed);
		await seedStoreDashboard(installed);
		await ensureDeliveryAutomations(installed);
		return { installed, features: featuresOf(a) };
	} catch (e: any) {
		for (const u of undo.reverse()) await u().catch((err: any) => console.error('Undoing the store:', err?.message));
		await syncDynamicModels({ app: req.app, force: true }).catch(() => undefined);
		throw e;
	}
};

/**
 * POST /commerce/setup: checks every answer, marks the store building and
 * builds it in the background (a 14-model build takes minutes on a remote
 * database — past a request's limit, docs/templates T-16). The panel polls
 * GET /commerce/settings for `status`.
 */
export const startSetup = async (req: any, project: any) => {
	const doc: any = await loadCommerce(project);
	if (doc.status === 'ready') throw new TenancyError(409, 'Your store is already set up — change it on Store settings.');
	if (doc.status === 'building') throw new TenancyError(409, 'Your store is being set up — this takes a minute or two.');
	const view = await commerceView(project);
	const needs = checkAll(view.answers, await offeredFor(project));
	if (Object.keys(needs).length) {
		const e: any = new TenancyError(400, 'Some answers need a look first', 'commerce_settings');
		e.extra = { problems: needs };
		throw e;
	}
	const scope = scopeOf(project);
	// Only one setup at a time: whoever moves it to building runs it.
	const claimed = await runInScope(scope, () =>
		CommerceSettings.updateOne({ _id: doc._id, status: { $in: ['new', 'failed'] } }, { $set: { status: 'building', startedAt: new Date() }, $unset: { error: 1, problems: 1, finishedAt: 1 } })
	);
	if (!claimed.modifiedCount) throw new TenancyError(409, 'Your store is being set up — this takes a minute or two.');

	setImmediate(() =>
		runInScope(scope, async () => {
			try {
				const { installed, features } = await install(req, project, view.answers);
				await CommerceSettings.updateOne({ _id: doc._id }, { $set: { status: 'ready', installed, features, finishedAt: new Date(), step: 'review' } });
				recordProjectEvent({ req, action: 'create', model: 'Store', modelPath: 'store', document: project._id, name: 'Store', text: 'set up the store' });
			} catch (e: any) {
				console.error('store setup:', e?.message, e?.problems || '');
				await CommerceSettings.updateOne(
					{ _id: doc._id },
					{ $set: { status: 'failed', error: e?.message || 'The store couldn’t be set up', problems: e?.problems || [], finishedAt: new Date() } }
				);
			}
		})
	);
	return commerceView(project);
};

/**
 * What a built store can't take (EC3): a feature switched off while it holds
 * what it made — products with several variants, customers with credit, an
 * open shift. Called before Store settings saves.
 */
export const settingsGuard = async (next: Answers, prev: Answers, doc: any) => {
	if (doc.status !== 'ready') return;
	const installed: Installed = doc.installed || {};
	const model = (k: ModelKey) => (installed[k] ? compiledModel(installed[k]!.name) : null);
	const problems: string[] = [];
	if (prev.products.variations && !next.products.variations) {
		const Variant: any = model('variant');
		const many = Variant ? await Variant.aggregate([{ $group: { _id: '$product', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: 'n' }]) : [];
		if (many[0]?.n) problems.push(`${many[0].n} product${many[0].n === 1 ? ' has' : 's have'} several variants — variations can’t be switched off while they do`);
	}
	if (prev.returns.storeCredit && !next.returns.storeCredit) {
		const Customer: any = model('customer');
		const n = Customer ? await Customer.countDocuments({ storeCredit: { $gt: 0 } }) : 0;
		if (n) problems.push(`${n} customer${n === 1 ? ' has' : 's have'} store credit — it can’t be switched off until it’s spent or taken back`);
	}
	if (prev.pos.shifts && !next.pos.shifts) {
		const Shift: any = model('shift');
		const n = Shift ? await Shift.countDocuments({ status: 'open' }) : 0;
		if (n) problems.push(`${n} shift${n === 1 ? ' is' : 's are'} open — close ${n === 1 ? 'it' : 'them'} before switching shifts off`);
	}
	if (problems.length) {
		const e: any = new TenancyError(409, problems[0], 'commerce_in_use');
		e.extra = { problems: { store: problems } };
		throw e;
	}
};

/** After Store settings saved on a built store: the sidebar follows, the features are recorded. */
export const afterSettingsSaved = async (project: any) =>
	runInScope(scopeOf(project), async () => {
		const doc: any = await CommerceSettings.findOne({}).lean();
		if (doc?.status !== 'ready') return;
		const view = await commerceView(project);
		await applySidebar(view.answers, doc.installed || {});
		await CommerceSettings.updateOne({ _id: doc._id }, { $set: { features: featuresOf(view.answers) } });
	});
