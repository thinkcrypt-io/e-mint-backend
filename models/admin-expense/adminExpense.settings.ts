import { SettingsType } from '../../imports.js';
import { ACCESS_CONTROL } from '../../lib/index.js';

const settings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		search: true,
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
	amount: {
		title: 'Amount',
		type: 'number',
		sort: true,
		search: false,
		required: true,
		filter: {
			name: 'amount',
			type: 'range',
			label: 'Amount',
			title: 'Filter by Amount',
		},
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
		populate: { path: 'project', select: 'name' },
		// filter: {
		// 	name: 'project',
		// 	field: 'project_in',
		// 	type: 'multi-select',
		// 	category: 'model',
		// 	model: ,
		// 	key: 'name',
		// 	label: 'Project',
		// 	title: 'Filter by Project',
		// },
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'project.name',
			model: 'projects',
			sort: true,
		},
	},
	details: {
		title: 'Details',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: { type: 'textarea' },
	},
	category: {
		title: 'Category',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'category',
			field: 'category_in',
			type: 'multi-select',
			label: 'Category',
			title: 'Filter by Category',
			category: 'distinct',
			key: 'category',
		},

		schema: { sort: true, default: true },
	},
	date: {
		title: 'Date',
		type: 'date',
		sort: true,
		edit: true,
		required: true,
		filter: { name: 'date', type: 'date', label: 'Date', title: 'Filter by Date' },
		schema: { type: 'date', tableType: 'date-only', sort: true, default: true },
	},
	tags: {
		title: 'Tags',
		type: 'array',
		search: false,
		edit: true,
		schema: {
			type: 'tag',
		},
	},
	receipt: {
		title: 'Receipt',
		type: 'string',
		schema: {
			type: 'file',
		},
	},
	note: {
		title: 'Note',
		type: 'string',
		edit: true,
		trim: true,
		schema: { type: 'textarea' },
	},
	...ACCESS_CONTROL.SETTINGS,

	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		edit: true,
		schema: { type: 'date', tableType: 'date-only' },
	},
};

export default settings;
