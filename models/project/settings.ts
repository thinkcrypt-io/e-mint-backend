import { SettingsType } from '../../lib/types/settings.types.js';
import Client from '../client/client.model.js';
import Software from '../software/software.model.js';
import Type from './types.js';

const statusOptions = [
	{
		label: 'New',
		value: 'new',
	},
	{
		label: 'In Progress',
		value: 'in-progress',
	},
	{
		label: 'Completed',
		value: 'completed',
	},
	{
		label: 'Cancelled',
		value: 'cancelled',
	},
	{
		label: 'On Hold',
		value: 'on-hold',
	},
	{
		label: 'Testing',
		value: 'testing',
	},
	{
		label: 'Deployed',
		value: 'deployed',
	},
	{
		label: 'Pending',
		value: 'pending',
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

	category: {
		edit: true,
		title: 'Category',
		type: 'string',
		search: true,
		schema: {
			displayInTable: true,
			default: true,
		},
	},
	clientName: {
		edit: true,
		title: 'Client Name',
		type: 'string',
		search: true,
	},
	devUrl: {
		edit: true,
		title: 'Dev Url',
		type: 'string',
	},
	liveUrl: {
		edit: true,
		title: 'Live Url',
		type: 'string',
	},
	testUrl: {
		edit: true,
		title: 'Test Url',
		type: 'string',
	},
	prodUrl: {
		edit: true,
		title: 'Prod Url',
		type: 'string',
	},

	projectType: {
		edit: true,
		title: 'Project Type',
		type: 'string',
		sort: true,
		filter: {
			name: 'projectType',
			field: 'projectType_in',
			type: 'multi-select',
			label: 'Project Type',
			title: 'Sort by project type',
			category: 'distinct',
			key: 'projectType',
		},
		schema: {
			sort: true,
			options: [
				{
					label: 'Frontend',
					value: 'frontend',
				},
				{
					label: 'Backend',
					value: 'backend',
				},
				{
					label: 'Fullstack',
					value: 'fullstack',
				},
				{
					label: 'Android',
					value: 'android',
				},
				{
					label: 'IOS',
					value: 'ios',
				},
				{
					label: 'Admin',
					value: 'admin',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
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
	project: {
		edit: true,
		title: 'Project',
		type: 'string',
		populate: {
			path: 'project',
			select: 'name',
		},
		sort: true,
		filter: {
			name: 'project',
			field: 'project_in',
			type: 'multi-select',
			label: 'Project',
			title: 'Sort by project',
			category: 'model',
			model: Software,
			key: 'name',
		},
	},
	technologies: {
		edit: true,
		title: 'Technologies',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	client: {
		edit: true,
		sort: true,
		title: 'Client',
		type: 'string',
		populate: {
			path: 'client',
			select: 'name',
		},
		schema: {
			displayInTable: true,
			sort: true,
			tableKey: 'client.name',
			type: 'data-menu',
			model: 'clients',
		},
	},
	frameworks: {
		edit: true,
		title: 'frameworks',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	libraries: {
		edit: true,
		title: 'Libraries',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	githubUrl: {
		edit: true,
		title: 'Github Url',
		type: 'string',
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
