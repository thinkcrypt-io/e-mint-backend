import { SettingsType } from '../../imports.js';
import Admin from '../../library/models/admin/model.js';

const leaveTypeOptions = [
	{
		value: 'annual',
		label: 'Annual',
	},
	{
		value: 'sick',
		label: 'sick',
	},
	{
		value: 'casual',
		label: 'Casual',
	},

	{
		value: 'unpaid',
		label: 'Unpaid',
	},

	{
		value: 'half-day',
		label: 'Half Day',
	},
];

const statusOptions = [
	{
		value: 'pending',
		label: 'Pending',
	},
	{
		value: 'approved',
		label: 'Approved',
	},
	{
		value: 'rejected',
		label: 'Rejected',
	},
	{
		value: 'cancelled',
		label: 'Cancelled',
	},
];

const leaveSettings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		search: true,
		trim: true,
		schema: { displayInTable: true, default: true, sort: true },
	},
	employee: {
		title: 'Employee',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		populate: { path: 'employee', select: 'name' },
		filter: {
			name: 'employee',
			field: 'employee_in',
			type: 'multi-select',
			label: 'Employee',
			title: 'Sort by Employee',
			category: 'model',
			model: Admin,
			key: 'name',
		},
		schema: {
			displayInTable: true,
			default: true,
			sort: true,
			tableType: 'text',
			tableKey: 'employee.name',
			type: 'data-menu',
			model: 'admins',
			modelAddOn: 'email',
		},
	},
	leaveType: {
		title: 'Leave Type',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		filter: {
			name: 'leaveType',
			field: 'leaveType_in',
			type: 'multi-select',
			label: 'Leave Type',
			title: 'Sort by Leave Type',
			options: leaveTypeOptions,
		},

		schema: {
			displayInTable: true,
			type: 'select',
			options: leaveTypeOptions,
			sort: true,
			default: true,
		},
	},
	startDate: {
		title: 'StartDate',
		type: 'date',
		sort: true,
		filter: {
			name: 'startDate',
			type: 'date',
			label: 'Start Date',
			title: 'Sort by Start Date',
		},

		edit: true,
		required: true,
		schema: { displayInTable: true, type: 'date', tableType: 'date-only', sort: true },
	},
	endDate: {
		title: 'End Date',
		type: 'string',
		sort: true,
		edit: true,
		schema: { displayInTable: true, type: 'date', tableType: 'date-only' },
	},
	numberOfDays: {
		title: 'No. of Days',
		type: 'number',
		sort: true,
		edit: true,
		required: true,
		schema: { displayInTable: true, sort: true, default: true },
	},
	reason: {
		title: 'Reason',
		type: 'string',
		search: true,
		edit: true,
		schema: { displayInTable: true, type: 'textarea' },
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		filter: {
			name: 'status',
			// field: 'status_in',
			type: 'select',
			label: 'Status',
			title: 'Sort by Status',
			options: statusOptions,
		},
		edit: true,
		required: true,
		schema: {
			displayInTable: true,
			type: 'select',
			options: statusOptions,
			default: true,
			sort: true,
		},
	},
	addedBy: {
		title: 'Added By',
		type: 'string',
		sort: true,

		populate: { path: 'addedBy', select: 'name' },
		filter: {
			name: 'addedBy',
			field: 'addedBy_in',
			type: 'multi-select',
			label: 'Added By',
			title: 'Sort by Added By',
			category: 'model',
			model: Admin,
			key: 'name',
		},
		schema: { displayInTable: true, tableType: 'string', tableKey: 'addedBy.name' },
	},
	access: {
		title: 'Access',
		type: 'array',
		edit: true,
		sort: true,
		filter: {
			name: 'access',
			field: 'access_in',
			type: 'multi-select',
			label: 'Access',
			title: 'Sort by Access',
			category: 'model',
			model: Admin,
			key: 'name',
		},
		schema: {
			type: 'data-tag',
			model: 'admins',
			modelAddOn: 'email',
			heplerText: 'Who has access to this invoice',
		},
	},
	attachment: {
		title: 'Attachment',
		type: 'uri',

		edit: true,
		schema: { displayInTable: true, type: 'file' },
	},

	createdAt: {
		title: 'CreatedAt',
		type: 'date',

		schema: { displayInTable: true, sort: true },
	},
};

export default leaveSettings;
