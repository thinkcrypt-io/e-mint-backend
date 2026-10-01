import { Admin, SettingsType } from '../../imports.js';

const STATUS = [
	{ label: 'Open', value: 'open' },
	{ label: 'In progress', value: 'in-progress' },
	{ label: 'Waiting on requester', value: 'waiting' },
	{ label: 'Resolved', value: 'resolved' },
	{ label: 'Closed', value: 'closed' },
];

const CATEGORY = [
	{ label: 'Question', value: 'question' },
	{ label: 'Account & access', value: 'account' },
	{ label: 'Billing', value: 'billing' },
	{ label: 'Something broken', value: 'bug' },
	{ label: 'Feature request', value: 'feature' },
	{ label: 'Other', value: 'other' },
];

const PRIORITY = [
	{ label: 'Low', value: 'low' },
	{ label: 'Normal', value: 'normal' },
	{ label: 'High', value: 'high' },
	{ label: 'Urgent', value: 'urgent' },
];

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		search: true,
		schema: { default: true, sort: true },
	},
	name: {
		title: 'Subject',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: { default: true, sort: true },
	},
	description: {
		title: 'Message',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: { type: 'textarea' },
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
			options: STATUS,
		},
		schema: { type: 'select', sort: true, default: true, options: STATUS },
	},
	category: {
		title: 'Category',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'category',
			field: 'category_in',
			type: 'multi-select',
			label: 'Category',
			title: 'Filter by Category',
			options: CATEGORY,
		},
		schema: { type: 'select', sort: true, default: true, options: CATEGORY },
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
			options: PRIORITY,
		},
		schema: { type: 'select', sort: true, default: true, options: PRIORITY },
	},
	images: {
		title: 'Images',
		type: 'array-string',
		edit: true,
		schema: { type: 'image-array' },
	},
	addedBy: {
		title: 'Opened by',
		type: 'string',
		sort: true,
		populate: { path: 'addedBy', select: 'name' },
		filter: {
			name: 'addedBy',
			field: 'addedBy_in',
			type: 'multi-select',
			category: 'model',
			model: Admin,
			key: 'name',
			label: 'Opened by',
			title: 'Filter by Opened by',
		},
		schema: {
			sort: true,
			default: true,
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'addedBy.name',
			model: 'admins',
		},
	},
	assignedTo: {
		title: 'Assigned to',
		type: 'string',
		sort: true,
		edit: true,
		populate: { path: 'assignedTo', select: 'name' },
		filter: {
			name: 'assignedTo',
			field: 'assignedTo_in',
			type: 'multi-select',
			category: 'model',
			model: Admin,
			key: 'name',
			label: 'Assigned to',
			title: 'Filter by Assigned to',
		},
		schema: {
			sort: true,
			default: true,
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'assignedTo.name',
			model: 'admins',
		},
	},
	replyCount: {
		title: 'Replies',
		type: 'number',
		sort: true,
		schema: { sort: true, default: true },
	},
	lastReplyAt: {
		title: 'Last reply',
		type: 'date',
		sort: true,
		filter: { name: 'lastReplyAt', type: 'date', label: 'Last reply', title: 'Filter by Last reply' },
		schema: { type: 'date', tableType: 'date', sort: true, default: true },
	},
	lastReplyBy: {
		title: 'Last reply by',
		type: 'string',
		sort: true,
		schema: {
			type: 'select',
			sort: true,
			options: [
				{ label: 'Support team', value: 'staff' },
				{ label: 'Requester', value: 'requester' },
			],
		},
	},
	note: {
		title: 'Internal note',
		type: 'string',
		search: true,
		edit: true,
		schema: { type: 'textarea' },
	},
	createdAt: {
		title: 'Opened at',
		type: 'date',
		sort: true,
		filter: { name: 'createdAt', type: 'date', label: 'Opened at', title: 'Filter by Opened at' },
		schema: { type: 'date', tableType: 'date', sort: true, default: true },
	},
};

export default settings;
