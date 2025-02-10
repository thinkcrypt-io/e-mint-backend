import { SettingsType } from '../../lib/types/settings.types.js';
import Type from './leads.type.js';

const statusOptions = [
	{
		label: 'New',
		value: 'new',
	},
	{
		label: 'Interested',
		value: 'interested',
	},
	{
		label: 'Contacted',
		value: 'contacted',
	},
	{
		label: 'Qualified',
		value: 'qualified',
	},
	{
		label: 'Attempted Contact',
		value: 'attempted-contact',
	},
	{
		label: 'Unqualified',
		value: 'unqualified',
	},
	{
		label: 'Follow Up',
		value: 'follow-up',
	},
	{
		label: 'Converted',
		value: 'converted',
	},
	{
		label: 'Dead',
		value: 'dead',
	},
	{
		label: 'Open',
		value: 'open',
	},
	{
		label: 'Won',
		value: 'won',
	},
	{
		label: 'Closed',
		value: 'closed',
	},
];

const settings: SettingsType<Type> = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
		schema: {
			default: true,
			displayInTable: true,
			sort: true,
		},
	},

	requirements: {
		edit: true,
		title: 'Requirements',
		type: 'string',
		schema: {
			type: 'textarea',
		},
	},

	email: {
		// unique: true,
		search: true,
		sort: true,
		title: 'Email',
		type: 'email',
		schema: {
			default: true,
			displayInTable: true,
			type: 'string',
		},
	},
	phone: {
		unique: true,
		search: true,
		edit: true,
		title: 'Phone',
		type: 'string',
		schema: {
			default: true,
			displayInTable: true,
		},
	},
	category: {
		edit: true,
		title: 'Category',
		type: 'string',
		search: true,
		schema: {
			displayInTable: true,
		},
	},
	businessName: {
		edit: true,
		title: 'Business Name',
		type: 'string',
		search: true,
		schema: {
			displayInTable: true,
		},
	},
	position: {
		edit: true,
		title: 'Position',
		type: 'string',
		schema: {
			displayInTable: true,
		},
	},
	businessAddress: {
		edit: true,
		title: 'Business Address',
		type: 'string',
		search: true,
		schema: {
			displayInTable: true,
			sort: true,
		},
	},
	city: {
		edit: true,
		title: 'City',
		type: 'string',
		search: true,
		sort: true,
		schema: {
			displayInTable: true,
			sort: true,
		},
		filter: {
			name: 'city',
			field: 'city_in',
			type: 'multi-select',
			label: 'City',
			title: 'Sort by city',
			category: 'distinct',
			key: 'city',
		},
	},
	assignedTo: {
		edit: true,
		title: 'Assigned To',
		type: 'string',
		populate: {
			path: 'assignedTo',
			select: 'name',
		},
		schema: {
			displayInTable: true,
			type: 'data-menu',
			tableType: 'text',
			tableKey: 'assignedTo.name',
			model: 'admins',
		},
	},
	industry: {
		edit: true,
		title: 'Industry',
		type: 'string',
		search: true,
		sort: true,
		schema: {
			sort: true,
			displayInTable: true,
		},
		filter: {
			name: 'industry',
			field: 'industry_in',
			type: 'multi-select',
			label: 'Industry',
			title: 'Sort by industry',
			category: 'distinct',
			key: 'industry',
		},
	},
	facebook: {
		edit: true,
		title: 'Facebook',
		type: 'string',
		search: true,
	},
	instagram: {
		edit: true,
		title: 'Instagram',
		type: 'string',
		search: true,
	},
	hasWebsite: {
		edit: true,
		title: 'Has Website',
		type: 'boolean',
		sort: true,
		filter: {
			name: 'hasWebsite',
			type: 'boolean',
			label: 'Has Website',
			title: 'Sort by website status',
		},
	},
	websiteUrl: {
		edit: true,
		title: 'Website URL',
		type: 'string',
		search: true,
		schema: {
			inputLabel: 'Enter Website Url',
			label: 'Website',
			helper: 'Website URI',
		},
	},
	isActive: {
		edit: true,
		type: 'boolean',
		title: 'Active Status',
		sort: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by active status',
		},
	},
	group: {
		edit: true,
		title: 'Group',
		type: 'string',
	},
	tags: {
		search: true,
		edit: true,
		title: 'Tags',
		type: 'array-string',
		sort: true,
		schema: {
			type: 'tag',
		},
		filter: {
			name: 'tags',
			field: 'tags_in',
			type: 'multi-select',
			label: 'Tag',
			title: 'Sort by Tag',
			category: 'distinct',
			key: 'tags',
		},
	},
	interestedIn: {
		edit: true,
		title: 'Interested In',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	priority: {
		edit: true,
		title: 'Priority',
		type: 'string',

		schema: {
			type: 'select',
			options: [
				{
					label: 'High',
					value: 'high',
				},
				{
					label: 'Medium',
					value: 'medium',
				},
				{
					label: 'Low',
					value: 'low',
				},
			],
		},

		sort: true,
		filter: {
			name: 'priority',
			field: 'priority_in',
			type: 'multi-select',
			label: 'Priority',
			title: 'Sort by priority',
			category: 'distinct',
			key: 'priority',
		},
	},
	leadType: {
		edit: true,
		title: 'Lead Type',
		type: 'string',
		sort: true,
		filter: {
			name: 'leadType',
			field: 'leadType_in',
			type: 'multi-select',
			label: 'Lead Type',
			title: 'Sort by lead type',
			category: 'distinct',
			key: 'leadType',
		},
		schema: {
			type: 'select',
			options: [
				{
					label: 'Cold',
					value: 'cold',
				},
				{
					label: 'Warm',
					value: 'warm',
				},
				{
					label: 'Hot',
					value: 'hot',
				},
			],
		},
	},
	estimatedBudget: {
		edit: true,
		title: 'Estimated Budget',
		type: 'number',
	},
	followUps: {
		edit: true,
		title: 'Follow Ups',
		type: 'array',
		schema: {
			type: 'tags',
		},
	},
	source: {
		edit: true,
		title: 'Source',
		type: 'string',
		sort: true,
		schema: {
			type: 'select',
			options: [
				{
					label: 'Facebook',
					value: 'facebook',
				},
				{
					label: 'Offline',
					value: 'offline',
				},
				{
					label: 'Inbound',
					value: 'inbound',
				},
				{
					label: 'Outbound Call',
					value: 'outbound-call',
				},
				{
					label: 'Outbound Email',
					value: 'outbound-email',
				},
				{
					label: 'Facebook ad',
					value: 'facebook-ad',
				},
				{
					label: 'Instagram',
					value: 'instagram',
				},
				{
					label: 'Google',
					value: 'google',
				},
				{
					label: 'Referral',
					value: 'referral',
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
		filter: {
			name: 'source',
			field: 'source_in',
			type: 'multi-select',
			label: 'Source',
			title: 'Sort by source',
			category: 'distinct',
			key: 'source',
		},
	},
	status: {
		edit: true,
		title: 'Status',
		type: 'string',
		search: true,
		sort: true,
		schema: {
			type: 'select',
			options: statusOptions,
		},
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Sort by status',
			category: 'distinct',
			key: 'status',
		},
	},
	notes: {
		edit: true,
		title: 'Notes',
		type: 'array-string',
		schema: {
			type: 'tags',
		},
	},
	isDeleted: {
		edit: true,
		title: 'Is Deleted',
		type: 'boolean',
	},
	createdAt: {
		title: 'Created At',
		type: 'string',
	},
	updatedAt: {
		title: 'Updated At',
		type: 'string',
	},
};

export default settings;
