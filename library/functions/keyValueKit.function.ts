import SidebarCategory from '../models/sidebarcategories/model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { buildFeature } from '../controllers/builder/features.service.js';
import { planFromAi } from '../controllers/builder/features.schema.js';
import { runInScope } from './tenantScope.function.js';
import { projectHooks } from './projectHooks.function.js';
import { KEY_VALUES_ROUTE } from './keyValue.function.js';

/**
 * Key values (docs/key-values): every project made from now on starts with this generic model — a name, a
 * description and keys (Specifications: Display → Size, Resolution, Panel). Any model's Key-value pairs field
 * then shows its groups as sections to fill: always, by a choice or a picked record, or through a link.
 * An ordinary built model: the builder can change it like any other. Projects made before it don't get it.
 */
export const KEY_VALUES_KIT = (category: string) => ({
	title: 'Key values',
	summary: 'Groups of keys — a name, a description and its keys — that Key-value pairs fields show as sections.',
	sidebarCategory: category,
	steps: [
		{
			action: 'create',
			name: 'KeyValue',
			route: KEY_VALUES_ROUTE,
			title: 'Key values',
			description: 'Groups of keys, like a product’s specifications — Display: Size, Resolution, Panel',
			buttonTitle: 'Add key values',
			displayField: 'name',
			rationale: 'A generic group of keys. Key-value pairs fields on other models show these as sections, people fill in the values.',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true, helper: 'The section’s heading — Display, Processor, Warranty' },
				{ key: 'description', label: 'Description', kind: 'textarea', helper: 'Shown under the heading' },
				{ key: 'keys', label: 'Keys', kind: 'tags', required: true, helper: 'What gets filled in — Size, Resolution, Panel type. Type one and press Enter' },
			],
			form: [{ sectionTitle: 'Key values', fields: ['name', 'description', 'keys'] }],
			table: ['name', 'keys'],
		},
	],
});

/** Builds Key values into a new project (projectHooks.created). A problem is logged — the project still opens. */
export const seedKeyValues = async (req: any, project: any) => {
	try {
		await runInScope({ organization: project.organization, project: project._id }, async () => {
			if (await ModelDefinition.exists({ route: KEY_VALUES_ROUTE })) return;
			const cat: any = await SidebarCategory.findOne({}, { name: 1 }).sort({ priority: -1 }).lean();
			await buildFeature(req, planFromAi(KEY_VALUES_KIT(cat?.name || 'Pages')), { source: 'wizard' });
		});
	} catch (e: any) {
		console.error('key values kit:', e?.message);
	}
};

projectHooks.onCreated(seedKeyValues);
