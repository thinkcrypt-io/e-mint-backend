import { SettingsType } from '../../imports.js';

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
		title: 'Name',
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
	accountEmail: {
		title: 'Account email',
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
	type: {
		title: 'Type',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		filter: {
			name: 'type',
			field: 'type_in',
			type: 'multi-select',
			label: 'Type',
			title: 'Filter by Type',
			options: [
				{
					label: 'Internal',
					value: 'internal',
				},
				{
					label: 'Client Owned',
					value: 'client-owned',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
		},
		schema: {
			type: 'select',

			default: true,
			sort: true,

			options: [
				{
					label: 'Internal',
					value: 'internal',
				},
				{
					label: 'Client Owned',
					value: 'client-owned',
				},
				{
					label: 'Other',
					value: 'other',
				},
			],
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
					label: 'Active',
					value: 'active',
				},
				{
					label: 'Inactive',
					value: 'inactive',
				},
				{
					label: 'Paused',
					value: 'paused',
				},
				{
					label: 'Archived',
					value: 'archived',
				},
			],
		},
		schema: {
			default: true,
			sort: true,
			type: 'select',
			options: [
				{
					label: 'Active',
					value: 'active',
				},
				{
					label: 'Inactive',
					value: 'inactive',
				},
				{
					label: 'Paused',
					value: 'paused',
				},
				{
					label: 'Archived',
					value: 'archived',
				},
			],
		},
	},
	notes: {
		title: 'Notes',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'editor',
		},
	},
	createdAt: {
		title: 'Created at',
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
