import { SettingsType } from '../../../imports.js';

const settings: SettingsType<any> = {
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
	description: {
		title: 'Description',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
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
				{ label: 'Planning', value: 'planning' },
				{ label: 'In Progress', value: 'in-progress' },
				{ label: 'Completed', value: 'completed' },
				{ label: 'Archived', value: 'archived' },
			],
		},
		schema: {
			type: 'select',
			sort: true,
			default: true,
			options: [
				{ label: 'Planning', value: 'planning' },
				{ label: 'In Progress', value: 'in-progress' },
				{ label: 'Completed', value: 'completed' },
				{ label: 'Archived', value: 'archived' },
			],
		},
	},
	stack: {
		title: 'Stack',
		type: 'string',
		edit: true,
		schema: {
			sort: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		edit: true,
		filter: { name: 'createdAt', type: 'date', label: 'Created at', title: 'Filter by Created at' },
		schema: { type: 'date', tableType: 'date-only', default: true, sort: true },
	},
};

export default settings;
