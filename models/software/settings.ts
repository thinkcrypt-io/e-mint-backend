import { Client, SettingsType } from '../../imports.js';
import Type from './types.js';
import { ACCESS_CONTROL } from '../../lib/index.js';

const settings: SettingsType<Type> = {
	name: {
		title: 'Name',
		type: 'string',
		search: true,
		edit: true,
		sort: true,
		required: true,
		trim: true,
		schema: { displayInTable: true, default: true, sort: true },
	},
	category: {
		title: 'Category',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: { displayInTable: true, sort: true },
	},
	description: {
		title: 'Description',
		type: 'string',
		edit: true,
		trim: true,
		schema: { displayInTable: true, type: 'textarea' },
	},
	client: {
		title: 'Client',
		type: 'string',
		sort: true,
		edit: true,
		populate: { path: 'client', select: 'name' },
		filter: {
			name: 'client',
			type: 'multi-select',
			field: 'client_in',
			category: 'model',
			model: Client,
			key: 'name',
			title: 'Sort by Client',
			label: 'Client',
		},
		schema: {
			displayInTable: true,
			tableType: 'string',
			tableKey: 'client.name',
			default: true,
			type: 'data-menu',
			model: 'clients',
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		required: true,
		edit: true,
		filter: {
			name: 'status',
			type: 'multi-select',
			field: 'status_in',
			category: 'distinct',
			key: 'status',
			title: 'Sort by Status',
			label: 'Status',
		},

		schema: {
			displayInTable: true,
			default: true,
			type: 'select',
			sort: true,
			options: [
				{
					label: 'Pending',
					value: 'pending',
				},
				{
					label: 'Planning',
					value: 'planning',
				},
				{
					label: 'In Progress',
					value: 'in-progress',
				},
				{
					label: 'Paused',
					value: 'paused',
				},
				{
					label: 'Testing',
					value: 'testing',
				},
				{
					label: 'Completed',
					value: 'completed',
				},
				{
					label: 'Maintenance',
					value: 'maintenance',
				},
				{
					label: 'Review',
					value: 'review',
				},
				{
					label: 'Cancelled',
					value: 'cancelled',
				},
				{
					label: 'Archived',
					value: 'archived',
				},
			],
		},
	},
	requirements: {
		title: 'Requirements',
		type: 'string',
		edit: true,
		trim: true,
		schema: { type: 'textarea' },
	},
	file: {
		title: 'File',
		type: 'uri',
		edit: true,
		trim: true,
		schema: { displayInTable: true, type: 'file' },
	},
	fileUrl: {
		title: 'File Url',
		type: 'uri',
		edit: true,
		trim: true,
		schema: { type: 'string' },
	},
	startDate: {
		title: 'Start Date',
		type: 'string',
		edit: true,
		schema: { displayInTable: true, type: 'date', tableType: 'date-only', sort: true },
	},
	endDate: {
		title: 'End Date',
		type: 'string',
		edit: true,
		schema: { displayInTable: true, type: 'date', tableType: 'date-only', sort: true },
	},
	deadline: {
		title: 'Deadline',
		type: 'string',
		edit: true,
		schema: { displayInTable: true, type: 'date', tableType: 'date-only', sort: true },
	},
	tags: {
		title: 'Tags',
		type: 'array-string',
		edit: true,
		schema: { displayInTable: true, type: 'tag' },
	},
	isActive: {
		title: 'IsActive',
		type: 'boolean',

		edit: true,
		schema: { displayInTable: true, type: 'checkbox' },
	},
	...ACCESS_CONTROL.SETTINGS,
	// addedBy: {
	// 	edit: true,
	// 	title: 'Added By',
	// 	type: 'string',
	// 	sort: true,

	// 	filter: {
	// 		name: 'addedBy',
	// 		field: 'addedBy_in',
	// 		type: 'multi-select',
	// 		label: 'Added By',
	// 		title: 'Sort by added by',
	// 		category: 'model',
	// 		model: Admin,
	// 		key: 'name',
	// 	},
	// },
	// access: {
	// 	edit: true,
	// 	title: 'Access',
	// 	type: 'array-string',
	// 	sort: true,
	// 	schema: {
	// 		label: 'Access',
	// 		type: 'data-tag',
	// 		model: 'admins',
	// 		modelAddOn: 'email',
	// 	},
	// },

	createdAt: {
		title: 'CreatedAt',
		type: 'date',
		sort: true,
		edit: true,

		schema: { displayInTable: true, sort: true },
		filter: {
			name: 'createdAt',
			field: 'createdAt',
			type: 'date',
			label: 'Created At',
			title: 'Sort by createdAt',
		},
	},
};

export default settings;
