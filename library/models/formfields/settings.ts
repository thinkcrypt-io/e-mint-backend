import { SettingsType } from '../../types/_index.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
		search: true,
		unique: true,
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
	path: {
		title: 'Path',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		unique: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	formFields: {
		title: 'Fields',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		schema: {
			type: 'form-fields',
		},
	},
	// model: {
	// 	title: 'Model',
	// 	type: 'string',
	// 	sort: true,
	// 	search: false,
	// 	edit: true,

	// 	populate: {
	// 		path: 'model',
	// 		select: 'name modelName route',
	// 	},

	// 	schema: {
	// 		type: 'data-menu',
	// 		tableType: 'string',
	// 		tableKey: 'model.modelName',
	// 		model: 'models',
	// 	},
	// },

	sch: {
		title: 'Schema',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		unique: true,
		required: true,
		schema: {
			type: 'data-menu',
			tableType: 'string',
			model: 'mongoose/list',
			dataKey: 'name',
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
