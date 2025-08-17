import { SettingsType } from '../../imports.js';

import Admin from '../admin/admin.model.js';

const privacyOptions = [
	{
		value: 'public',
		label: 'Public',
	},
	{
		value: 'private',
		label: 'Private',
	},
	{
		value: 'only-me',
		label: 'Only Me',
	},
];

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	name: {
		title: 'Name of the project',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	client: {
		title: 'Client',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		populate: {
			path: 'client',
			select: 'name',
		},

		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'client.name',
			model: 'clients',
		},
	},
	clientLocation: {
		title: 'Client location',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{
					label: 'Lead',
					value: 'lead',
				},
				{
					label: 'Qualified',
					value: 'qualified',
				},
				{
					label: 'Proposal_sent',
					value: 'proposal_sent',
				},
				{
					label: 'Negotiation',
					value: 'negotiation',
				},
				{
					label: 'In_progress',
					value: 'in_progress',
				},
				{
					label: 'On_hold',
					value: 'on_hold',
				},
				{
					label: 'Closed_won',
					value: 'closed_won',
				},
				{
					label: 'Closed_lost',
					value: 'closed_lost',
				},
			],
		},
		schema: {
			default: true,
			sort: true,
			type: 'select',
			options: [
				{
					label: 'Lead',
					value: 'lead',
				},
				{
					label: 'Qualified',
					value: 'qualified',
				},
				{
					label: 'Proposal Sent',
					value: 'proposal_sent',
				},
				{
					label: 'Negotiation',
					value: 'negotiation',
				},
				{
					label: 'In progress',
					value: 'in_progress',
				},
				{
					label: 'On hold',
					value: 'on_hold',
				},
				{
					label: 'Closed won',
					value: 'closed_won',
				},
				{
					label: 'Closed lost',
					value: 'closed_lost',
				},
			],
		},
	},
	category: {
		title: 'Category',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'category',
			field: 'category_in',
			type: 'multi-select',
			label: 'Category',
			title: 'Filter by Category',
			options: [
				{
					label: 'App',
					value: 'app',
				},
				{
					label: 'Crm',
					value: 'crm',
				},
				{
					label: 'Custom_software',
					value: 'custom_software',
				},
				{
					label: 'Ecommerce',
					value: 'ecommerce',
				},
				{
					label: 'Erp',
					value: 'erp',
				},
				{
					label: 'Mvp',
					value: 'mvp',
				},
				{
					label: 'Website',
					value: 'website',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
		},
		schema: {
			default: true,
			sort: true,
			type: 'select',
			options: [
				{
					label: 'App',
					value: 'app',
				},
				{
					label: 'Crm',
					value: 'crm',
				},
				{
					label: 'Custom software',
					value: 'custom_software',
				},
				{
					label: 'Ecommerce',
					value: 'ecommerce',
				},
				{
					label: 'Erp',
					value: 'erp',
				},
				{
					label: 'Mvp',
					value: 'mvp',
				},
				{
					label: 'Website',
					value: 'website',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
		},
	},
	estimatedValue: {
		title: 'Estimated Value',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		schema: {
			default: true,
			sort: true,
			helpertext: 'Estimated value of the project in BDT',
		},
	},
	agreedValue: {
		title: 'Agreed value',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		schema: {
			default: true,
			sort: true,
			helpertext: 'Agreed value of the project in BDT',
		},
	},
	currency: {
		title: 'Currency',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'currency',
			field: 'currency_in',
			type: 'multi-select',
			label: 'Currency',
			title: 'Filter by Currency',
			options: [
				{
					label: 'BDT',
					value: 'BDT',
				},
				{
					label: 'USD',
					value: 'USD',
				},
				{
					label: 'EUR',
					value: 'EUR',
				},
				{
					label: 'GBP',
					value: 'GBP',
				},
				{
					label: 'Other',
					value: 'OTHER',
				},
			],
		},
		schema: {
			type: 'select',
			options: [
				{
					label: 'BDT',
					value: 'BDT',
				},
				{
					label: 'USD',
					value: 'USD',
				},
				{
					label: 'EUR',
					value: 'EUR',
				},
				{
					label: 'GBP',
					value: 'GBP',
				},
				{
					label: 'Other',
					value: 'OTHER',
				},
			],
		},
	},
	estimatedStartDate: {
		title: 'Estimated Start Date',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'estimatedStartDate',
			type: 'date',
			label: 'Estimated start date',
			title: 'Filter by Estimated start date',
		},
		schema: {
			type: 'date',
			tableType: 'date-only',
			sort: true,
			default: true,
		},
	},
	timeline: {
		title: 'Timeline',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: {
			helpertext: 'Estimated timeline for the project (in weeks)',
			sort: true,
			default: true,
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'editor',
		},
	},
	riskLevel: {
		title: 'Risk level',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'riskLevel',
			field: 'riskLevel_in',
			type: 'multi-select',
			label: 'RiskLevel',
			title: 'Filter by RiskLevel',
			options: [
				{
					label: 'Low',
					value: 'low',
				},
				{
					label: 'Medium',
					value: 'medium',
				},
				{
					label: 'High',
					value: 'high',
				},
			],
		},
		schema: {
			type: 'select',
			options: [
				{
					label: 'Low',
					value: 'low',
				},
				{
					label: 'Medium',
					value: 'medium',
				},
				{
					label: 'High',
					value: 'high',
				},
			],
		},
	},
	closedReason: {
		title: 'Closed reason',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: {
			type: 'editor',
		},
	},
	priority: {
		title: 'Priority',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		schema: {},
	},
	tags: {
		title: 'Tags',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {},
	},
	note: {
		title: 'Note',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'editor',
		},
	},
	document: {
		title: 'Document',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'file',
		},
	},
	source: {
		title: 'Source',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'source',
			field: 'source_in',
			type: 'multi-select',
			label: 'Source',
			title: 'Filter by Source',
			options: [
				{
					label: 'Referral',
					value: 'referral',
				},
				{
					label: 'Website',
					value: 'website',
				},
				{
					label: 'Linkedin',
					value: 'linkedin',
				},
				{
					label: 'Event',
					value: 'event',
				},
				{
					label: 'Cold_email',
					value: 'cold_email',
				},
				{
					label: 'Partner',
					value: 'partner',
				},
				{
					label: 'Social_media',
					value: 'social_media',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
		},
		schema: {
			sort: true,
			type: 'select',
			options: [
				{
					label: 'Referral',
					value: 'referral',
				},
				{
					label: 'Website',
					value: 'website',
				},
				{
					label: 'Linkedin',
					value: 'linkedin',
				},
				{
					label: 'Event',
					value: 'event',
				},
				{
					label: 'Cold_email',
					value: 'cold_email',
				},
				{
					label: 'Partner',
					value: 'partner',
				},
				{
					label: 'Social_media',
					value: 'social_media',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
		},
	},
	requirements: {
		title: 'Requirements',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'file',
		},
	},
	quotation: {
		title: 'Quotation',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'file',
		},
	},
	lastInteractionDate: {
		title: 'Last Interaction Date',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'lastInteractionDate',
			type: 'date',
			label: 'Last interaction date',
			title: 'Filter by Last interaction date',
		},
		schema: {
			type: 'date',
			tableType: 'string',
		},
	},
	interactionSummary: {
		title: 'Interaction Summary',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'editor',
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Created at',
			title: 'Filter by Created at',
		},
		schema: {
			type: 'date-only',
			tableType: 'string',
		},
	},
	addedBy: {
		edit: true,
		title: 'Added By',
		type: 'string',
		sort: true,
		filter: {
			name: 'addedBy',
			field: 'addedBy_in',
			type: 'multi-select',
			label: 'Added By',
			title: 'Sort by added by',
			category: 'model',
			model: Admin,
			key: 'name',
		},

		populate: {
			path: 'addedBy',
			select: 'name email',
		},

		schema: {
			displayInTable: true,
			tableKey: 'addedBy.name',
		},
	},
	privacy: {
		title: 'Privacy',
		type: 'string',
		edit: true,
		sort: true,
		required: true,
		filter: {
			name: 'privacy',
			field: 'privacy_in',
			type: 'multi-select',
			label: 'Privacy',
			title: 'Sort By Privacy',
			options: privacyOptions,
		},
		schema: {
			type: 'select',
			options: privacyOptions,
			sort: true,
			default: true,
		},
	},
	access: {
		edit: true,
		title: 'Access',
		type: 'array-string',

		sort: true,
		filter: {
			name: 'access',
			field: 'access_in',
			type: 'multi-select',
			label: 'Access',
			title: 'Sort by access',
			category: 'model',
			model: Admin,
			key: 'name',
		},
		schema: {
			type: 'data-tag',
			model: 'admins',
			modelAddOn: 'email',
		},
	},
};

export default settings;
