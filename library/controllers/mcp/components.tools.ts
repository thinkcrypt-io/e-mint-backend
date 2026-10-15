import { COMPONENT_KINDS } from '../../functions/dynamicModels.function.js';
import { componentsWithUsage, saveComponentCore } from '../builder/components.controller.js';
import { fieldProps } from '../builder/ai.controller.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * Components over MCP (docs/cms D3, CMS-03): the user's own AI lists the
 * groups of fields a project has made once (a Button, an SEO block, a Hero)
 * and makes or changes one; models then use them through a field of kind
 * `component` in plan_feature / build_feature / update_page.
 */

type Out = { text: string; data?: any; isError?: boolean };

const fieldLine = (f: any) => `${f.key} (${f.kind}${f.required ? ', required' : ''}${f.options?.length ? `: ${f.options.map((o: any) => o.value).join('/')}` : ''})`;

const listComponents = async (): Promise<Out> => {
	const comps = await componentsWithUsage();
	if (!comps.length)
		return { text: 'No components yet. Make one with save_component when several models need the same group of fields (a button, an SEO block, a card).', data: { components: [] } };
	const lines = comps.map(
		c =>
			`- ${c.uid} — ${c.title}${c.description ? `: ${c.description}` : ''}\n  fields: ${c.fields.map(fieldLine).join(', ')}${
				c.usedBy.length ? `\n  used by: ${c.usedBy.map((u: any) => `${u.title}.${u.field}${u.repeatable ? ' (list)' : ''}`).join(', ')}` : ''
			} [id ${c._id}]`
	);
	return { text: `Components (use one with a field {kind: "component", component: "<uid>", repeatable?}):\n${lines.join('\n')}`, data: { components: comps } };
};

const saveComponent = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const out = await saveComponentCore({ ...req, user: caller.user }, args?.id || null, {
		category: args?.category,
		name: args?.name,
		title: args?.title,
		description: args?.description,
		icon: args?.icon,
		fields: args?.fields,
	});
	if (out.status >= 400) return { text: `${out.body?.message}${out.body?.problems?.length ? `:\n- ${out.body.problems.join('\n- ')}` : ''}`, isError: true };
	const c = out.body;
	const refreshed = c.refreshed?.length ? ` Models using it were updated: ${c.refreshed.map((m: any) => m.title).join(', ')}.` : '';
	return { text: `Saved the component ${c.uid} (${c.title}) with ${c.fields.length} field(s).${refreshed} ${caller.link('/components')}`, data: c };
};

const FIELD = { type: 'object', required: ['key', 'label', 'kind'], properties: { ...fieldProps, kind: { type: 'string', enum: [...COMPONENT_KINDS] } } };

export const COMPONENT_TOOLS: ToolDef[] = [
	{
		name: 'list_components',
		title: 'List the components',
		description: 'The groups of fields this project made once and models reuse (uid, title, fields, the models using them). Read it before planning a model that needs a button, an SEO block, a card or a section of a page.',
		scope: 'read',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: (_req, _args, _caller) => listComponents(),
	},
	{
		name: 'save_component',
		title: 'Make or change a component',
		description:
			'A component: a named group of fields any model can use once or as a list (field kind "component"). Without `id` it makes one — `category` (shared, content, seo…) and `name` make its uid "category.name", fixed once made; with `id` it changes one (every model using it follows). Its fields can be text, textarea, editor, email, url, color, number, formula, boolean, date, select, multiselect, tags, image, images, file, files, video, reference / references (with `ref`, a model of the project), section / sectionlist (a group or list of rows of plain fields), or component (another component, once or `repeatable` — one whose fields are all plain; a component inside another can’t hold groups or components itself). Describe it to the user and get their go-ahead first.',
		scope: 'build',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'The component to change (from list_components); leave out to make one' },
				category: { type: 'string', description: 'New ones: a short lowercase word, e.g. "shared" or "content"' },
				name: { type: 'string', description: 'New ones: lowercase with dashes, e.g. "button" or "hero"' },
				title: { type: 'string' },
				description: { type: 'string' },
				icon: { type: 'string', description: 'A Lucide icon name, e.g. "mouse-pointer-click"' },
				fields: { type: 'array', items: FIELD, description: 'All its fields, in order (a change replaces the list)' },
			},
			required: ['title', 'fields'],
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: saveComponent,
	},
];
