import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	icon: {
		title: 'Icon',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			type: 'image',
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
			default: true,
			sort: true,
		},
	},
	shortDescription: {
		title: 'Short description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			type: 'textarea',
			default: true,
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	priority: {
		title: 'Priority',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
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
	featureList: {
		title: 'Feature list',
		type: 'array',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'array-string',
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
			tableType: 'string',
		},
	},
};

export default settings;
