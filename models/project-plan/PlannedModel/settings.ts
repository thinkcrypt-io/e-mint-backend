import { PlannedProject, SettingsType } from '../../../imports.js';

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
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	project: {
		title: 'Project',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		populate: { path: 'project', select: 'name' },
		filter: {
			name: 'project',
			field: 'project_in',
			type: 'multi-select',
			category: 'model',
			model: PlannedProject,
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
			sort: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		edit: true,
		filter: { name: 'createdAt', type: 'date', label: 'Created at', title: 'Filter by Created at' },
		schema: { type: 'date', tableType: 'date-only', sort: true },
	},
};

export default settings;
