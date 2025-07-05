import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Page Title',
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
	subTitle: {
		title: 'Page Sub Title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	path: {
		title: 'Path',
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
	export: {
		title: 'Export Button',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'export',
			type: 'boolean',
			label: 'Export',
			title: 'Filter by Export',
		},
		schema: {},
	},
	showAddButton: {
		title: 'Show Create button',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,

		schema: {},
	},
	buttonTitle: {
		title: 'Create Button Title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {},
	},
	buttonIsModal: {
		title: 'Pop Up Create Button',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		schema: {},
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
