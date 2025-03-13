import { Admin, SettingsType } from '../../imports.js';
import { ACCESS_CONTROL } from '../../lib/index.js';

const priorityOptions = [
	{
		value: 'high',
		label: 'High',
	},
	{
		value: 'medium',
		label: 'Medium',
	},
	{
		value: 'low',
		label: 'Low',
	},
];

const statusOptions = [
	{
		value: 'draft',
		label: 'Draft',
	},
	{
		value: 'scheduled',
		label: 'Scheduled',
	},
	{
		value: 'pending',
		label: 'Pending',
	},
	{
		value: 'completed',
		label: 'Completed',
	},
	{
		value: 'cancelled',
		label: 'Cancelled',
	},

	{
		value: 'in-progress',
		label: 'In Progress',
	},
	{
		value: 'rescheduled',
		label: 'Rescheduled',
	},
	{
		value: 'postponed',
		label: 'Postponed',
	},
	{
		value: 'archived',
		label: 'Archived',
	},
];

const meetingSettings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		trim: true,

		schema: { displayInTable: true },
	},
	name: {
		title: 'Name',
		type: 'string',
		search: true,
		required: true,
		trim: true,
		edit: true,
		sort: true,

		schema: { displayInTable: true, default: true },
	},
	agenda: {
		title: 'Agenda',
		type: 'string',
		trim: true,
		edit: true,

		schema: { displayInTable: true, type: 'textarea' },
	},
	description: {
		title: 'Description',
		type: 'string',
		edit: true,
	},
	priority: {
		title: 'Priority',
		type: 'string',
		sort: true,
		edit: true,

		schema: {
			displayInTable: true,
			default: true,
			type: 'select',
			options: priorityOptions,
			sort: true,
		},
		filter: {
			name: 'priority',
			field: 'priority_in',
			type: 'multi-select',
			label: 'priority',
			title: 'Sort by priority',
			options: priorityOptions,
		},
	},
	tags: {
		title: 'Tags',
		type: 'array-string',
		search: false,
		edit: true,

		schema: {
			type: 'tag',
		},
		filter: {
			name: 'tags',
			field: 'tags_in',
			type: 'multi-select',
			label: 'tags',
			title: 'Sort by tags',
			category: 'distinct',
			key: 'tags',
		},
	},
	host: {
		title: 'Host',
		type: 'string',
		sort: true,
		edit: true,

		populate: { path: 'host', select: 'name' },
		schema: {
			displayInTable: true,
			type: 'data-menu',
			model: 'admins',
			sort: true,
			viewType: 'object',
			tableKey: 'host.name',
			viewKey: 'name',
		},
		filter: {
			name: 'host',
			field: 'host',
			type: 'multi-select',
			label: 'host',
			title: 'Sort by host',
			category: 'model',
			model: Admin,
		},
	},
	invitees: {
		edit: true,

		title: 'Invitees',
		type: 'array-string',
		schema: {
			displayInTable: true,
			model: 'admins',
			label: 'Invitees',
			type: 'tag',
		},
	},
	client: {
		title: 'Client',
		type: 'string',
		edit: true,

		sort: true,
		populate: { path: 'client', select: 'name' },
		schema: {
			displayInTable: true,
			type: 'data-menu',
			model: 'clients',
			tableKey: 'client.name',
			tableType: 'text',
			sort: true,
		},
	},
	project: {
		title: 'Project',
		type: 'string',
		edit: true,
		sort: true,
		populate: { path: 'project', select: 'name' },
		schema: {
			displayInTable: true,
			type: 'data-menu',
			model: 'projects',
			tableType: 'text',
			tableKey: 'project.name',
			sort: true,
		},
	},
	lead: {
		title: 'Lead',
		type: 'string',
		edit: true,

		sort: true,
		populate: { path: 'lead', select: 'name' },
		schema: {
			displayInTable: true,
			type: 'data-menu',
			model: 'leads',
			tableType: 'text',
			tableKey: 'lead.name',
			sort: true,
		},
	},
	date: {
		title: 'Date',
		type: 'string',
		edit: true,

		sort: true,
		schema: {
			displayInTable: true,
			default: true,
			sort: true,
			type: 'date',
			tableType: 'date-only',
		},
		filter: {
			name: 'date',
			type: 'date',
			label: 'date',
			title: 'Sort by date',
		},
	},
	scheduledTime: {
		title: 'Scheduled Time',
		type: 'string',
		edit: true,

		schema: { displayInTable: true, type: 'string' },
	},
	duration: {
		title: 'Duration',
		type: 'string',
		edit: true,

		schema: { displayInTable: true },
	},
	startTime: {
		title: 'Start Time',
		type: 'string',
		edit: true,

		schema: { displayInTable: true, type: 'string', default: true },
	},
	endTime: {
		title: 'End Time',
		type: 'string',
		edit: true,
		schema: { displayInTable: true, type: 'string' },
	},
	externalCalendarId: {
		title: 'ExternalCalendarId',
		type: 'uri',
		edit: true,

		schema: { displayInTable: true, type: 'string' },
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		schema: {
			displayInTable: true,
			default: true,
			type: 'select',
			options: statusOptions,
			sort: true,
		},
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'status',
			title: 'Sort by status',
			options: statusOptions,
		},
	},
	rescheduleReason: {
		title: 'Reschedule Reason',
		type: 'string',
		edit: true,

		schema: { displayInTable: true, type: 'textarea' },
	},
	cancelReason: {
		title: 'Cancel Reason',
		type: 'string',
		edit: true,

		schema: { displayInTable: true, type: 'textarea' },
	},
	meetingType: {
		title: 'Meeting Type',
		type: 'string',
		sort: true,
		edit: true,

		required: true,
		schema: {
			displayInTable: true,
			sort: true,
			default: true,
			type: 'select',
			options: [
				{ value: 'in-person', label: 'In-Person' },
				{ value: 'virtual', label: 'Virtual' },
				{ value: 'hybrid', label: 'Hybrid' },
			],
		},
		filter: {
			name: 'meetingType',
			field: 'meetingType_in',
			type: 'multi-select',
			label: 'Meeting Type',
			title: 'Sort by Meeting Type',
			options: [
				{ value: 'in-person', label: 'In-Person' },
				{ value: 'virtual', label: 'Virtual' },
				{ value: 'hybrid', label: 'Hybrid' },
			],
		},
	},
	location: {
		title: 'Location',
		type: 'string',
		edit: true,

		schema: {
			displayInTable: true,
		},
	},

	map: {
		title: 'Map',
		edit: true,

		type: 'uri',
		schema: {
			displayInTable: true,
			type: 'string',
			viewType: 'external-link',
			tableType: 'external-link',
		},
	},
	platform: {
		title: 'Virtual Meeting Platform',
		type: 'string',
		search: true,
		edit: true,

		schema: { displayInTable: true },
	},
	meetingUrl: {
		title: 'Meeting Url',
		type: 'uri',
		edit: true,

		schema: {
			displayInTable: true,
			type: 'string',
			tableType: 'external-link',
			viewType: 'external-link',
		},
	},
	meetingId: {
		title: 'MeetingId',
		type: 'string',
		edit: true,

		schema: {
			copy: true,
			displayInTable: true,
		},
	},
	meetingPassword: {
		title: 'MeetingPassword',
		type: 'string',
		edit: true,

		schema: {
			copy: true,
		},
	},
	note: {
		title: 'Note',
		type: 'string',
		edit: true,

		schema: { type: 'textarea' },
	},
	participants: {
		title: 'Participants',
		type: 'array-string',
		edit: true,

		schema: { type: 'tag' },
	},
	file: {
		title: 'File',
		edit: true,

		type: 'string',
		schema: { type: 'file' },
	},
	fileUrl: {
		title: 'File Url',
		type: 'uri',
		edit: true,

		schema: { type: 'string', tableType: 'external-link', viewType: 'external-link' },
	},
	recordingUrl: {
		title: 'RecordingUrl',
		type: 'uri',
		edit: true,

		schema: { type: 'string', viewType: 'external-link', tableType: 'external-link', copy: true },
	},
	...ACCESS_CONTROL.SETTINGS,

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

// 'agenda',
// 'description',

// 'duration',

// 'note',
// 'participants',

export default meetingSettings;
