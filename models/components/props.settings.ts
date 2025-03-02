import { Component, SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	component: {
		title: 'Component',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		populate: { path: 'component', select: 'name' },
		filter: {
			name: 'component',
			field: 'component_in',
			type: 'multi-select',
			category: 'model',
			model: Component,
			key: 'name',
			label: 'Component',
			title: 'Filter by Component',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'component.name',
			model: 'components',
			sort: true,
			default: true,
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
	type: {
		title: 'Type',
		type: 'string',
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
		},
	},
	typeValue: {
		title: 'Type value',
		type: 'string',
		edit: true,
		schema: {
			type: 'textarea',
			helperText:
				'Enter the type value in JSON format, if type is opject or contains multiple selectable values',
		},
	},
	isRequired: {
		title: 'Is required',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'isRequired',
			type: 'boolean',
			label: 'Required',
			title: 'Filter by Is required',
		},
		schema: {
			default: true,
			sort: true,
		},
	},
	condition: {
		title: 'Condition',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	default: {
		title: 'Default',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		schema: { type: 'date', tableType: 'date-only' },
	},
};

export default settings;
