import { SettingsType, Software } from '../../imports.js';
import { ACCESS_CONTROL } from '../../lib/index.js';

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		search: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	name: {
		title: 'Title',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	project: {
		title: 'Project',
		type: 'string',
		sort: true,
		edit: true,
		populate: { path: 'project', select: 'name', populate: 'client' },
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
			default: true,
		},
	},
	client: {
		title: 'Client',
		type: 'string',
		schema: {
			tableKey: 'project.client.name',
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	startDate: {
		title: 'Start Date',
		type: 'date',
		sort: true,
		edit: true,
		required: true,
		filter: {
			name: 'startDate',
			type: 'date',
			label: 'Start date',
			title: 'Filter by Start date',
		},
		schema: { type: 'date', tableType: 'date-only', default: true, sort: true },
	},
	endDate: {
		title: 'End Date',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		required: true,
		filter: { name: 'endDate', type: 'date', label: 'End date', title: 'Filter by End date' },
		schema: { type: 'date', tableType: 'date-only', default: true, sort: true },
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{ label: 'Active', value: 'active' },
				{ label: 'Pending', value: 'pending' },
				{ label: 'Ended', value: 'ended' },
				{ label: 'On Hold', value: 'on-hold' },
				{ label: 'Extended', value: 'extended' },
				{ label: 'Cancelled', value: 'cancelled' },
			],
		},
		schema: {
			type: 'select',
			sort: true,
			default: true,
			options: [
				{ label: 'Active', value: 'active' },
				{ label: 'Pending', value: 'pending' },
				{ label: 'Ended', value: 'ended' },
				{ label: 'On Hold', value: 'on-hold' },
				{ label: 'Extended', value: 'extended' },
				{ label: 'Cancelled', value: 'cancelled' },
			],
		},
	},
	attachment: {
		title: 'Attachment',
		type: 'string',
		edit: true,
		schema: {
			type: 'file',
		},
	},
	priority: {
		title: 'Priority',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'priority',
			field: 'priority_in',
			type: 'multi-select',
			label: 'Priority',
			title: 'Filter by Priority',
			options: [
				{ label: 'Low', value: 'low' },
				{ label: 'Medium', value: 'medium' },
				{ label: 'High', value: 'high' },
				{ label: 'Critical', value: 'critical' },
			],
		},
		schema: {
			type: 'select',
			sort: true,
			options: [
				{ label: 'Low', value: 'low' },
				{ label: 'Medium', value: 'medium' },
				{ label: 'High', value: 'high' },
				{ label: 'Critical', value: 'critical' },
			],
		},
	},
	...ACCESS_CONTROL.SETTINGS,
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		edit: true,
		filter: { name: 'createdAt', type: 'date', label: 'Created at', title: 'Filter by Created at' },
		schema: { type: 'date', tableType: 'date-only' },
	},
};

export default settings;
