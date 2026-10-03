import { ProjectTemplate } from '../models/templates/_index.js';
import { fillPlaceholders, normalizeBlueprint, stepIdentity, whatsInside } from '../controllers/templates/blueprint.js';
import { STARTERS, starterList } from './starterTemplates.function.js';
import { currentScope } from './tenantScope.function.js';

/**
 * The code starters (starterTemplates.function.ts, WO-35) as the first
 * templates (docs/templates TD14): each is upserted at boot as a published
 * `app` template when its key is missing — never overwritten, so the super
 * admin's edits stay. The code list stays the fallback when no published app
 * template exists (like route settings: the DB copy, code as the fallback).
 */

/** What the code starters don't say: who they're for, each model's description, and a setup guide. */
const EXTRA: Record<string, { category: string; audience: string; description: string; models: Record<string, string>; guide: { title: string; body: string; page: string }[] }> = {
	'clients-invoices': {
		category: 'Finance',
		audience: 'Freelancers, agencies and small businesses that bill their clients.',
		description:
			'Keep your clients in one place and bill them. Each invoice has line items that total themselves, and shows what’s been paid and what’s still due.\n\nOpen a client to see all of their invoices.',
		models: { Client: 'The people and companies you bill.', Invoice: 'What you’ve billed each client: line items, total, paid and due.' },
		guide: [
			{ title: 'Add your first client', body: 'Clients are who you bill. Add one, or import a list from a spreadsheet with Bulk upload.', page: 'Client' },
			{ title: 'Create an invoice', body: 'Pick the client, add line items (quantity × rate), and the total works itself out.', page: 'Invoice' },
			{ title: 'Record payments', body: 'Fill in Paid as money comes in — Due shows what’s left.', page: 'Invoice' },
		],
	},
	'projects-tasks': {
		category: 'Operations',
		audience: 'Teams that run several projects and want to see what’s done and what’s due.',
		description: 'Projects with a status and dates, and the tasks in each — who’s on them, how urgent they are and when they’re due.\n\nOpen a project to see its tasks.',
		models: { Project: 'The pieces of work you track, with their status and dates.', Task: 'What has to be done in each project, by whom and when.' },
		guide: [
			{ title: 'Add a project', body: 'Give it a name, a status and its start and end dates.', page: 'Project' },
			{ title: 'Add its tasks', body: 'Each task belongs to a project and has a status, a priority and a due date.', page: 'Task' },
		],
	},
	leads: {
		category: 'Sales',
		audience: 'Anyone selling to businesses who wants a simple sales pipeline.',
		description: 'Every lead from first contact to won or lost: their stage, what the deal is worth, where they came from and the next step.',
		models: { Lead: 'Everyone who might buy, how far along they are and what the deal is worth.' },
		guide: [
			{ title: 'Add your leads', body: 'Add them one by one, or import a spreadsheet with Bulk upload.', page: 'Lead' },
			{ title: 'Move them through the stages', body: 'Update the stage as you talk to them — filter the table by stage to see your pipeline.', page: 'Lead' },
		],
	},
	products: {
		category: 'Commerce',
		audience: 'Shops and makers who keep a product catalogue and stock levels.',
		description: 'A product catalogue in categories, each product with its price, stock, picture and an SKU code made for you.',
		models: { Category: 'How your products are grouped.', Product: 'What you sell: price, stock and pictures.' },
		guide: [
			{ title: 'Create your categories', body: 'Group your products, e.g. “Shirts”, “Shoes”.', page: 'Category' },
			{ title: 'Add your products', body: 'Each product gets an SKU code automatically. Untick “For sale” to hide one without deleting it.', page: 'Product' },
		],
	},
};

const starterBlueprint = (s: (typeof STARTERS)[number]) => {
	const extra = EXTRA[s.key];
	const steps = (s.plan.steps || []).map((step: any) => ({ ...step, description: step.description || extra?.models?.[step.name] || '' }));
	const names = steps.map((step: any) => stepIdentity(step).name);
	return normalizeBlueprint('app', {
		overview: { name: s.title, summary: s.description, description: extra?.description, audience: extra?.audience, category: extra?.category, icon: s.icon },
		models: { steps },
		sidebar: [{ name: s.plan.title, icon: s.icon, description: s.plan.summary, items: names.map((model: string) => ({ model })) }],
		guide: { steps: extra?.guide || [] },
	});
};

/** At boot: the starters as published templates, where missing. Never throws. */
export const seedStarterTemplates = async () => {
	try {
		for (const s of STARTERS) {
			if (await ProjectTemplate.exists({ key: s.key })) continue;
			const blueprint = starterBlueprint(s);
			await ProjectTemplate.create({
				key: s.key,
				type: 'app',
				status: 'published',
				name: s.title,
				summary: s.description,
				category: blueprint.overview.category,
				icon: s.icon,
				draft: blueprint,
				published: blueprint,
				version: 1,
				versions: [{ version: 1, blueprint, notes: 'The starter template, moved in from code.' }],
				changed: false,
				source: 'starter',
			});
		}
	} catch (e: any) {
		console.error(`Starter templates: ${e.message}`);
	}
};

/** Published app templates the caller's organization may use (TD12). */
const usableAppTemplates = async () => {
	const org = currentScope()?.organization;
	return ProjectTemplate.find(
		{
			type: 'app',
			status: 'published',
			$or: [{ visibility: 'everyone' }, ...(org ? [{ visibility: 'organizations', organizations: org }] : [])],
		},
		{ key: 1, name: 1, summary: 1, icon: 1, published: 1 }
	)
		.sort({ name: 1 })
		.lean();
};

/** The Get started page's starters (WO-35): published app templates, else the code list. */
export const starterTemplates = async () => {
	const docs: any[] = await usableAppTemplates();
	if (!docs.length) return starterList();
	return docs.map(d => ({
		key: d.key,
		title: d.name,
		description: d.summary,
		icon: d.icon,
		models: whatsInside(d.published).models.map((m: any) => m.title),
	}));
};

/**
 * One starter as a feature plan — models only, with placeholders filled from
 * their defaults. The full apply engine (T-03) replaces this for templates
 * with sidebars, dashboards and the rest.
 */
export const starterPlan = async (key: string) => {
	const doc: any = (await usableAppTemplates()).find((d: any) => d.key === key);
	if (doc) {
		const { blueprint } = fillPlaceholders(doc.published, {});
		return { template: doc._id, plan: { title: blueprint.overview.name, summary: blueprint.overview.summary || blueprint.overview.name, sidebarCategory: 'new', steps: blueprint.models.steps } };
	}
	const code = STARTERS.find(s => s.key === key);
	return code ? { template: null, plan: code.plan } : null;
};
