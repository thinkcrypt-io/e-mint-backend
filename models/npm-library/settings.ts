import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Package Name',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	version: {
		title: 'Package Version',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
		},
	},
	type: {
		title: 'Package Type',
		type: 'string',

		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
			helperText: 'Type of the package, e.g., frontend, backend, security, etc.',
		},
	},
	description: {
		title: 'Package Description',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	npmUrl: {
		title: 'Npm URL',
		type: 'uri',

		edit: true,
		trim: true,
		schema: {
			type: 'string',
			viewType: 'external-link',
			tableType: 'external-link',
		},
	},
	githubUrl: {
		title: 'Github URL',
		type: 'uri',
		edit: true,
		trim: true,
		schema: {
			type: 'string',
			viewType: 'external-link',
			tableType: 'external-link',
		},
	},
	website: {
		title: 'Website URL',
		type: 'uri',
		edit: true,
		trim: true,
		schema: {
			type: 'string',
			viewType: 'external-link',
			tableType: 'external-link',
		},
	},
	demoUrl: {
		title: 'Demo URL',
		type: 'uri',
		edit: true,
		trim: true,
		schema: {
			type: 'string',
			viewType: 'external-link',
			tableType: 'external-link',
		},
	},
	documentationUrl: {
		title: 'Documentation URL',
		type: 'uri',
		edit: true,
		trim: true,
		schema: {
			type: 'string',
			viewType: 'external-link',
			tableType: 'external-link',
		},
	},
	weeklyDownloads: {
		title: 'Weekly downloads',
		type: 'string',
		edit: true,
		schema: {
			default: true,
		},
	},
	packageSize: {
		title: 'Package Size',
		type: 'string',
		edit: true,
		schema: {},
	},
	author: {
		title: 'Author',
		type: 'string',
		edit: true,
		schema: {},
	},
	installCommand: {
		title: 'Install Command',
		type: 'string',
		edit: true,
		required: true,
		trim: true,
		schema: {
			copy: true,
		},
	},
	note: {
		title: 'Note',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	isDeprecated: {
		title: 'Is deprecated',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'isDeprecated',
			type: 'boolean',
			label: 'Is deprecated',
			title: 'Filter by Is deprecated',
		},
		schema: {},
	},
	usageFrequency: {
		title: 'Usage frequency',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'usageFrequency',
			field: 'usageFrequency_in',
			type: 'multi-select',
			label: 'UsageFrequency',
			title: 'Filter by UsageFrequency',
			options: [
				{
					label: 'Rare',
					value: 'rare',
				},
				{
					label: 'Occasional',
					value: 'occasional',
				},
				{
					label: 'Frequent',
					value: 'frequent',
				},
				{
					label: 'Standard',
					value: 'standard',
				},
			],
		},
		schema: {
			sort: true,
			type: 'select',
			options: [
				{
					label: 'Rare',
					value: 'rare',
				},
				{
					label: 'Occasional',
					value: 'occasional',
				},
				{
					label: 'Frequent',
					value: 'frequent',
				},
				{
					label: 'Standard',
					value: 'standard',
				},
			],
		},
	},
	priorityLevel: {
		title: 'Priority level',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'priorityLevel',
			field: 'priorityLevel_in',
			type: 'multi-select',
			label: 'PriorityLevel',
			title: 'Filter by PriorityLevel',
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
				{
					label: 'Critical',
					value: 'critical',
				},
			],
		},
		schema: {
			sort: true,
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
				{
					label: 'Critical',
					value: 'critical',
				},
			],
		},
	},
	expertise: {
		title: 'Expertise',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'expertise',
			field: 'expertise_in',
			type: 'multi-select',
			label: 'Expertise',
			title: 'Filter by Expertise',
			options: [
				{
					label: 'Beginner',
					value: 'beginner',
				},
				{
					label: 'Intermediate',
					value: 'intermediate',
				},
				{
					label: 'Advanced',
					value: 'advanced',
				},
				{
					label: 'Expert',
					value: 'expert',
				},
			],
		},
		schema: {
			sort: true,
			type: 'select',
			options: [
				{
					label: 'Beginner',
					value: 'beginner',
				},
				{
					label: 'Intermediate',
					value: 'intermediate',
				},
				{
					label: 'Advanced',
					value: 'advanced',
				},
				{
					label: 'Expert',
					value: 'expert',
				},
			],
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
					label: 'Active',
					value: 'active',
				},
				{
					label: 'Deprecated',
					value: 'deprecated',
				},
				{
					label: 'Unmaintained',
					value: 'unmaintained',
				},
			],
		},
		schema: {
			sort: true,
			type: 'select',
			options: [
				{
					label: 'Active',
					value: 'active',
				},
				{
					label: 'Deprecated',
					value: 'deprecated',
				},
				{
					label: 'Unmaintained',
					value: 'unmaintained',
				},
			],
		},
	},
	alternates: {
		title: 'Alternate Packages',
		type: 'array',
		edit: true,
		schema: {
			type: 'data-tag',
			model: 'npmlibraries',
		},
	},
	tags: {
		title: 'Tags',
		type: 'array',
		edit: true,
		schema: {
			type: 'tag',
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		edit: true,

		schema: {
			tableType: 'date-only',
		},
	},
};

export default settings;
