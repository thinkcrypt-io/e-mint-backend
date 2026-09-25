import { SettingsType } from '../../types/_index.js';

const settings: SettingsType<any> = {
	name: {
		unique: true,
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
	shortName: {
		title: 'Short name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {},
	},
	priority: {
		title: 'Priority',
		type: 'number',
		sort: false,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	accessLevel: {
		title: 'Access level',
		type: 'number',
		sort: false,
		edit: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	tooltip: {
		title: 'Tooltip',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	// A Lucide icon name ('folder', 'users') — the sidebar draws it with
	// DynamicIcon. It was typed 'uri' with an image input, which rejected every
	// name the sidebar can actually use.
	icon: {
		title: 'Icon',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'icon',
		},
	},
	isActive: {
		title: 'Is active',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Is active',
			title: 'Filter by Is active',
		},
		schema: {
			default: true,
			sort: true,
			displayValue: {
				true: 'Active',
				false: 'Disabled',
			},
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
			type: 'textarea',
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		edit: true,
		schema: {
			type: 'date-only',
			tableType: 'string',
		},
	},
};

export default settings;
