import { SettingsType } from '../../imports.js';

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
		title: 'Name',
		type: 'string',
		search: true,
		edit: true,
		required: true,
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
			default: true,
			sort: true,
			type: 'textarea',
		},
	},
	version: {
		title: 'Version',
		type: 'string',
		edit: true,
		schema: {
			type: 'string',
		},
	},
	platform: {
		title: 'Platform',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		filter: {
			name: 'platform',
			type: 'select',
			label: 'Platform',
			title: 'Filter by Platform',
			options: [
				{ label: 'Frontend', value: 'frontend' },
				{ label: 'Backend', value: 'backend' },
				{ label: 'Other', value: 'other' },
			],
		},
		schema: {
			type: 'select',
			default: true,
			sort: true,
			options: [
				{ label: 'Frontend', value: 'frontend' },
				{ label: 'Backend', value: 'backend' },
				{ label: 'Other', value: 'other' },
			],
		},
	},
	imports: {
		title: 'Imports',
		type: 'array',
		edit: true,
		schema: { type: 'tag' },
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		filter: { name: 'createdAt', type: 'date', label: 'Created at', title: 'Filter by Created at' },
		schema: { type: 'date', tableType: 'date-only' },
	},
};

export default settings;
