import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	position: {
		title: 'Position',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	department: {
		title: 'Department',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	location: {
		title: 'Location',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		schema: {
			sort: true,
		},
	},
	type: {
		title: 'Type',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		schema: {
			sort: true,
		},
	},
	excerpt: {
		title: 'Excerpt',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		schema: {},
	},
	code: {
		title: 'Code',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	metaTitle: {
		title: 'Meta title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: {},
	},
	metaDescription: {
		title: 'Meta description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: {},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{
					label: 'Draft',
					value: 'draft',
				},
				{
					label: 'Published',
					value: 'published',
				},
				{
					label: 'Archived',
					value: 'archived',
				},
			],
		},
		schema: {
			sort: true,
			default: true,
			type: 'select',
			options: [
				{
					label: 'Draft',
					value: 'draft',
				},
				{
					label: 'Published',
					value: 'published',
				},
				{
					label: 'Archived',
					value: 'archived',
				},
			],
		},
	},
	endDate: {
		title: 'Deadline',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		required: true,
		filter: {
			name: 'endDate',
			type: 'date',
			label: 'Deadline',
			title: 'Filter by Deadline',
		},
		schema: {
			default: true,
			sort: true,
			type: 'date',
			tableType: 'date-only',
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
			type: 'date',
			tableType: 'date-only',
		},
	},
};

export default settings;
