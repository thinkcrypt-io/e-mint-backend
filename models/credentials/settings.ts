import { SettingsType } from '../../lib/types/settings.types.js';
import Admin from '../../library/models/admin/model.js';
import Client from '../client/client.model.js';
import Software from '../software/software.model.js';

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
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
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		min: 3,
		max: 50,
		schema: {
			sort: true,
			default: true,
		},
	},
	platform: {
		title: 'Platform',
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
	url: {
		title: 'Login Url',
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
	userid: {
		title: 'User ID',
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
	key: {
		title: 'Key',
		type: 'string',
		sort: false,
		search: false,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	value: {
		title: 'Value',
		type: 'string',
		sort: false,
		search: false,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
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
					label: 'Password',
					value: 'password',
				},
				{
					label: 'Api Key',
					value: 'api-key',
				},
				{
					label: 'Env',
					value: 'env',
				},
				{
					label: 'Token',
					value: 'token',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
		},
		schema: {
			type: 'select',
			options: [
				{
					label: 'Password',
					value: 'password',
				},
				{
					label: 'Api Key',
					value: 'api-key',
				},
				{
					label: 'Env',
					value: 'env',
				},
				{
					label: 'Token',
					value: 'token',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
		},
	},

	description: {
		title: 'Description',
		type: 'string',

		edit: true,
		trim: true,
		schema: {
			type: 'editor',
		},
	},
	note: {
		title: 'Note',
		type: 'string',

		edit: true,
		trim: true,
		schema: {
			type: 'editor',
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
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'client.name',
			model: 'clients',
		},
	},
	project: {
		title: 'Project',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		populate: {
			path: 'project',
			select: 'name',
		},
		filter: {
			name: 'project',
			field: 'project_in',
			type: 'multi-select',
			category: 'model',
			model: Software,
			key: 'name',
			label: 'Project',
			title: 'Filter by Project',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'project.name',
			model: 'projects',
		},
	},
	privacy: {
		title: 'Privacy',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'privacy',
			field: 'privacy_in',
			type: 'multi-select',
			label: 'Privacy',
			title: 'Filter by Privacy',
			options: [
				{
					label: 'Public',
					value: 'public',
				},
				{
					label: 'Private',
					value: 'private',
				},
				{
					label: 'Only Me',
					value: 'only-me',
				},
			],
		},
		schema: {
			type: 'select',
			options: [
				{
					label: 'Public',
					value: 'public',
				},
				{
					label: 'Private',
					value: 'private',
				},
				{
					label: 'Only Me',
					value: 'only-me',
				},
			],
		},
	},
	addedBy: {
		title: 'Added by',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		populate: {
			path: 'addedBy',
			select: 'name',
		},
		filter: {
			name: 'addedBy',
			field: 'addedBy_in',
			type: 'multi-select',
			category: 'model',
			model: Admin,
			key: 'name',
			label: 'Added by',
			title: 'Filter by Added by',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'addedBy.name',
			model: 'addedBys',
		},
	},
	access: {
		title: 'Access',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {},
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
			type: 'date',
			tableType: 'date-only',
		},
	},
	updatedAt: {
		title: 'Updated at',
		type: 'date',
		sort: true,
		search: false,
		edit: true,

		schema: {
			type: 'date',
			tableType: 'date-only',
		},
	},
};

export default settings;
