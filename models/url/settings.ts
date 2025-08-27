import { SettingsType } from '../../imports.js';
import Project from '../project/project.model.js';
import Hosting from '../hosting/model.js';
import Client from '../client/client.model.js';

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		sort: false,
		search: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	url: {
		title: 'URL',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
			tableType: 'external-link',
			viewType: 'external-link',
		},
	},
	connectedDomain: {
		title: 'Connected Domain',
		type: 'string',
		sort: false,
		search: true,
		edit: true,

		trim: true,
		schema: {
			sort: true,
			default: true,
			helperText: 'The domain (production) that is connected to the URL',
			tableType: 'external-link',
			viewType: 'external-link',
		},
	},
	project: {
		title: 'Project',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		required: true,
		populate: {
			path: 'project',
			select: 'name',
		},
		filter: {
			name: 'project',
			field: 'project_in',
			type: 'multi-select',
			category: 'model',
			model: Project,
			key: 'name',
			label: 'Project',
			title: 'Filter by Project',
		},
		schema: {
			sort: true,
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'project.name',
			model: 'projects',
		},
	},
	client: {
		title: 'Client',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		required: true,
		populate: {
			path: 'client',
			select: 'name',
		},
		filter: {
			name: 'client',
			field: 'client_in',
			type: 'multi-select',
			category: 'model',
			model: Client,
			key: 'name',
			label: 'Client',
			title: 'Filter by Client',
		},
		schema: {
			sort: true,
			default: true,

			type: 'data-menu',
			tableType: 'string',
			tableKey: 'client.name',
			model: 'clients',
		},
	},
	category: {
		title: 'Category',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		filter: {
			name: 'category',
			field: 'category_in',
			type: 'multi-select',
			label: 'Category',
			title: 'Filter by Category',
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
					label: 'Admin',
					value: 'admin',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
		},
		schema: {
			sort: true,
			default: true,
			type: 'select',
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
	isActive: {
		title: 'Status',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		required: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Is active',
			title: 'Filter by Is active',
		},
		schema: {
			sort: true,
			default: true,
			type: 'select',
			options: [
				{
					label: 'Active',
					value: true,
				},
				{
					label: 'Inactive',
					value: false,
				},
			],
			displayValue: {
				true: 'Active',
				false: 'Inactive',
			},
		},
	},
	hosting: {
		title: 'Hosting',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		populate: {
			path: 'hosting',
			select: 'name',
		},
		filter: {
			name: 'hosting',
			field: 'hosting_in',
			type: 'multi-select',
			category: 'model',
			model: Hosting,
			key: 'name',
			label: 'Hosting',
			title: 'Filter by Hosting',
		},
		schema: {
			sort: true,
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'hosting.name',
			model: 'hostings',
		},
	},
	gitRepo: {
		title: 'Git repo',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	gitAccount: {
		title: 'Git account',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	branch: {
		title: 'Branch',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {},
	},
	version: {
		title: 'Version',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	environment: {
		title: 'Environment',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		filter: {
			name: 'environment',
			field: 'environment_in',
			type: 'multi-select',
			label: 'Environment',
			title: 'Filter by Environment',
			options: [
				{
					label: 'Production',
					value: 'production',
				},
				{
					label: 'Staging',
					value: 'staging',
				},
				{
					label: 'Demo',
					value: 'demo',
				},
				{
					label: 'Test',
					value: 'test',
				},
			],
		},
		schema: {
			type: 'select',
			options: [
				{
					label: 'Production',
					value: 'production',
				},
				{
					label: 'Staging',
					value: 'staging',
				},
				{
					label: 'Demo',
					value: 'demo',
				},
				{
					label: 'Test',
					value: 'test',
				},
			],
		},
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
			sort: true,
			type: 'date',
			tableType: 'date-only',
		},
	},
};

export default settings;
