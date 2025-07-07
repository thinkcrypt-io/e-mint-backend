import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: { default: true, sort: true },
	},
	description: {
		title: 'Description',
		type: 'string',
		edit: true,
		trim: true,
		schema: { type: 'textarea' },
	},
	url: {
		title: 'URL',
		type: 'string',
		edit: true,
		required: true,
		trim: true,
		schema: { default: true, sort: true, copy: true },
	},
	isActive: {
		title: 'Active',
		type: 'boolean',
		edit: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	slug: {
		title: 'Slug',
		type: 'string',
		unique: true,
		edit: false,
		trim: true,
		schema: { default: true, sort: true },
	},
};

export default settings;
