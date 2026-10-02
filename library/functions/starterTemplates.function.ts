/**
 * Starter templates for a new app project (docs/multi-tenancy WO-35): a
 * first feature in one click on the Get started page — ordinary built models,
 * planned and built like any feature (features.service.ts), so they can be
 * changed afterwards like anything else. Shapes are the AI plan's
 * (features.schema.ts planFromAi).
 */

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

type Starter = { key: string; title: string; description: string; icon: string; models: string[]; plan: any };

export const STARTERS: Starter[] = [
	{
		key: 'clients-invoices',
		title: 'Clients & invoices',
		description: 'Your clients, and invoices with line items that add themselves up.',
		icon: 'receipt-text',
		models: ['Clients', 'Invoices'],
		plan: {
			title: 'Clients & invoices',
			summary: 'Clients, and invoices for them with line items and totals.',
			sidebarCategory: 'new',
			steps: [
				{
					action: 'create',
					name: 'Client',
					title: 'Clients',
					rationale: 'The people and companies you work for.',
					displayField: 'name',
					fields: [
						{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true },
						{ key: 'company', label: 'Company', kind: 'text', searchable: true },
						{ key: 'email', label: 'Email', kind: 'email' },
						{ key: 'phone', label: 'Phone', kind: 'text' },
						{ key: 'address', label: 'Address', kind: 'textarea' },
						{ key: 'notes', label: 'Notes', kind: 'textarea' },
					],
				},
				{
					action: 'create',
					name: 'Invoice',
					title: 'Invoices',
					rationale: 'What each client owes: line items, total, paid and due.',
					displayField: 'code',
					code: { enabled: true, prefix: 'INV' },
					fields: [
						{ key: 'client', label: 'Client', kind: 'reference', ref: 'Client', required: true },
						{ key: 'issueDate', label: 'Issue date', kind: 'date', default: 'now' },
						{ key: 'dueDate', label: 'Due date', kind: 'date' },
						{
							key: 'status',
							label: 'Status',
							kind: 'select',
							default: 'draft',
							options: opts(['draft', 'Draft'], ['sent', 'Sent'], ['paid', 'Paid'], ['overdue', 'Overdue']),
						},
						{
							key: 'items',
							label: 'Items',
							kind: 'sectionlist',
							addLabel: 'Add item',
							fields: [
								{ key: 'item', label: 'Item', kind: 'text' },
								{ key: 'quantity', label: 'Quantity', kind: 'number', default: 1 },
								{ key: 'rate', label: 'Rate', kind: 'number' },
								{ key: 'total', label: 'Total', kind: 'formula', formula: 'quantity * rate' },
							],
						},
						{ key: 'total', label: 'Total', kind: 'formula', formula: 'sum(items.total)' },
						{ key: 'paid', label: 'Paid', kind: 'number', default: 0 },
						{ key: 'due', label: 'Due', kind: 'formula', formula: 'total - paid' },
					],
					filters: ['status', 'client'],
				},
			],
		},
	},
	{
		key: 'projects-tasks',
		title: 'Projects & tasks',
		description: 'Projects with their tasks, who’s on them and when they’re due.',
		icon: 'list-checks',
		models: ['Projects', 'Tasks'],
		plan: {
			title: 'Projects & tasks',
			summary: 'Projects, and the tasks in each with a status, priority and due date.',
			sidebarCategory: 'new',
			steps: [
				{
					action: 'create',
					name: 'Project',
					title: 'Projects',
					rationale: 'The pieces of work you track.',
					displayField: 'name',
					fields: [
						{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true },
						{ key: 'status', label: 'Status', kind: 'select', default: 'active', options: opts(['planned', 'Planned'], ['active', 'Active'], ['done', 'Done'], ['on-hold', 'On hold']) },
						{ key: 'startDate', label: 'Start', kind: 'date' },
						{ key: 'endDate', label: 'End', kind: 'date' },
						{ key: 'description', label: 'Description', kind: 'textarea' },
					],
					filters: ['status'],
				},
				{
					action: 'create',
					name: 'Task',
					title: 'Tasks',
					rationale: 'What has to be done in each project.',
					displayField: 'title',
					fields: [
						{ key: 'title', label: 'Title', kind: 'text', required: true, searchable: true },
						{ key: 'project', label: 'Project', kind: 'reference', ref: 'Project' },
						{ key: 'status', label: 'Status', kind: 'select', default: 'todo', options: opts(['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']) },
						{ key: 'priority', label: 'Priority', kind: 'select', default: 'normal', options: opts(['low', 'Low'], ['normal', 'Normal'], ['high', 'High']) },
						{ key: 'assignee', label: 'Assignee', kind: 'text' },
						{ key: 'dueDate', label: 'Due', kind: 'date' },
						{ key: 'notes', label: 'Notes', kind: 'textarea' },
					],
					filters: ['status', 'priority', 'project'],
				},
			],
		},
	},
	{
		key: 'leads',
		title: 'Leads pipeline',
		description: 'Leads from first contact to won or lost, with their value and source.',
		icon: 'funnel',
		models: ['Leads'],
		plan: {
			title: 'Leads',
			summary: 'A sales pipeline: each lead’s stage, value and where it came from.',
			sidebarCategory: 'new',
			steps: [
				{
					action: 'create',
					name: 'Lead',
					title: 'Leads',
					rationale: 'Everyone who might buy, and how far along they are.',
					displayField: 'name',
					fields: [
						{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true },
						{ key: 'company', label: 'Company', kind: 'text', searchable: true },
						{ key: 'email', label: 'Email', kind: 'email' },
						{ key: 'phone', label: 'Phone', kind: 'text' },
						{
							key: 'stage',
							label: 'Stage',
							kind: 'select',
							default: 'new',
							options: opts(['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['proposal', 'Proposal'], ['won', 'Won'], ['lost', 'Lost']),
						},
						{ key: 'value', label: 'Value', kind: 'number' },
						{ key: 'source', label: 'Source', kind: 'select', options: opts(['website', 'Website'], ['referral', 'Referral'], ['social', 'Social'], ['event', 'Event'], ['other', 'Other']) },
						{ key: 'nextStep', label: 'Next step', kind: 'text' },
						{ key: 'notes', label: 'Notes', kind: 'textarea' },
					],
					filters: ['stage', 'source'],
				},
			],
		},
	},
	{
		key: 'products',
		title: 'Products & stock',
		description: 'A catalogue in categories, with prices and stock levels.',
		icon: 'package',
		models: ['Categories', 'Products'],
		plan: {
			title: 'Products',
			summary: 'Product categories, and products with price, stock and images.',
			sidebarCategory: 'new',
			steps: [
				{
					action: 'create',
					name: 'Category',
					title: 'Categories',
					rationale: 'How products are grouped.',
					displayField: 'name',
					fields: [
						{ key: 'name', label: 'Name', kind: 'text', required: true, unique: true, searchable: true },
						{ key: 'description', label: 'Description', kind: 'textarea' },
						{ key: 'image', label: 'Image', kind: 'image' },
					],
				},
				{
					action: 'create',
					name: 'Product',
					title: 'Products',
					rationale: 'What you sell: price, stock and pictures.',
					displayField: 'name',
					code: { enabled: true, prefix: 'SKU' },
					fields: [
						{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true },
						{ key: 'category', label: 'Category', kind: 'reference', ref: 'Category' },
						{ key: 'price', label: 'Price', kind: 'number', required: true, min: 0 },
						{ key: 'stock', label: 'In stock', kind: 'number', default: 0 },
						{ key: 'active', label: 'For sale', kind: 'boolean', default: true },
						{ key: 'image', label: 'Image', kind: 'image' },
						{ key: 'description', label: 'Description', kind: 'textarea' },
					],
					filters: ['category', 'active'],
				},
			],
		},
	},
];

export const starterList = () => STARTERS.map(({ plan, ...s }) => s);
