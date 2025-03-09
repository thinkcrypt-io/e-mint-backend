import { SettingsType } from '../../lib/types/settings.types.js';
import Admin from '../admin/admin.model.js';
import Client from '../client/client.model.js';
import Project from '../project/project.model.js';
import Software from '../software/software.model.js';
import Type from './document.types.js';

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

const directionOptions = [
	{
		label: 'Inbound',
		value: 'inbound',
	},
	{
		label: 'Outbound',
		value: 'outbound',
	},
	{
		label: 'Internal',
		value: 'internal',
	},
	{
		label: 'Other',
		value: 'other',
	},
];

const settings: SettingsType<any> = {
	code: {
		search: true,
		title: 'Code',
		type: 'string',
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
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

	description: {
		edit: true,
		title: 'Description',
		type: 'string',
		search: true,
		schema: {
			type: 'textarea',
			default: true,
		},
	},

	client: {
		edit: true,
		title: 'Client',
		type: 'string',
		sort: true,
		filter: {
			name: 'client',
			field: 'client_in',
			type: 'multi-select',
			label: 'Client',
			title: 'Sort by client',
			category: 'model',
			model: Client,
			key: 'name',
		},
		populate: {
			path: 'client',
			select: 'name',
		},
		schema: {
			default: true,
			displayInTable: true,
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'client.name',
			sort: true,
			model: 'clients',
		},
	},
	docUrl: {
		edit: true,
		title: 'Document URL',
		type: 'uri',
		schema: {
			type: 'string',
			default: true,
			displayInTable: true,
			viewType: 'external-link',
			tableType: 'external-link',
		},
	},
	fileUrl: {
		edit: true,
		title: 'File Url',
		type: 'uri',
		schema: {
			type: 'string',
			default: true,
			displayInTable: true,
			viewType: 'external-link',
			tableType: 'external-link',
		},
	},
	category: {
		edit: true,
		title: 'Category',
		type: 'string',
		search: true,
		required: true,
		sort: true,
		filter: {
			type: 'multi-select',
			name: 'category',
			field: 'category_in',
			label: 'Category',
			title: 'Filter by category',
			category: 'distinct',
			key: 'category',
		},

		schema: {
			displayInTable: true,
			sort: true,
			default: true,
		},
	},
	direction: {
		edit: true,
		title: 'Direction',
		type: 'string',
		sort: true,
		filter: {
			name: 'direction',
			field: 'direction_in',
			type: 'multi-select',
			label: 'Doc Type',
			title: 'Sort by type',
			category: 'distinct',
			key: 'direction',
		},
		schema: {
			label: 'Type',
			displayInTable: true,
			sort: true,
			type: 'select',
			options: directionOptions,
			helperText: 'Select the type of the document',
		},
	},

	project: {
		edit: true,

		title: 'Project',
		type: 'string',
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
		populate: {
			path: 'project',
			select: 'name',
		},
		schema: {
			default: true,
			displayInTable: true,
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'project.name',
			sort: true,
			model: 'projects',
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

	createdAt: {
		title: 'Created At',
		type: 'string',
		schema: {
			type: 'date',
			displayInTable: true,
		},
	},
};

export default settings;
