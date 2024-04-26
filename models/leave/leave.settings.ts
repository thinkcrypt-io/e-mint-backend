import LeaveType, { LeaveSettingsType } from './leave.type.js';

const settings: LeaveSettingsType = {
	employee: {
		type: 'string',
		title: 'Employee',
		required: true,
		sort: true,
		populate: {
			path: 'employee',
			select: 'name email',
		},
	},
	leaveType: {
		type: 'string',
		title: 'Leave Type',
		required: true,
		sort: true,
	},
	startDate: {
		type: 'string',
		title: 'Start Date',
		required: true,
		sort: true,
		edit: true,
		filter: {
			name: 'startDate',
			type: 'date',
			label: 'Start Date',
			title: 'Start Date',
		},
	},
	endDate: {
		type: 'string',
		title: 'Start Date',
		required: true,
		sort: true,
		edit: true,
		filter: {
			name: 'startDate',
			type: 'date',
			label: 'Start Date',
			title: 'Start Date',
		},
	},
	reason: {
		type: 'string',
		title: 'Reason',
		required: true,
	},
	status: {
		type: 'string',
		title: 'Status',

		sort: true,
		edit: true,
		filter: {
			name: 'status',
			type: 'multi-select',
			label: 'Status',
			title: 'Status',
			options: [
				{ label: 'Pending', value: 'pending' },
				{ label: 'Approved', value: 'approved' },
				{ label: 'Rejected', value: 'rejected' },
				{ label: 'Cancelled', value: 'cancelled' },
			],
		},
	},
	days: {
		type: 'number',
		title: 'Days',
		sort: true,
		edit: true,
	},
	approvedBy: {
		type: 'string',
		title: 'Approved By',
		required: false,
	},
	appliedOn: {
		type: 'string',
		title: 'Applied On',
		required: false,
	},
	trackingId: {
		type: 'string',
		title: 'Tracking Id',

		search: true,
	},
	comments: {
		type: 'string',
		title: 'Comments',
		required: false,
	},
	isActive: {
		type: 'boolean',
		title: 'Is Active',
	},
	createdAt: {
		type: 'string',
		title: 'Created At',
		required: false,
	},
	updatedAt: {
		type: 'string',
		title: 'Updated At',
		required: false,
	},
};

export default settings;
