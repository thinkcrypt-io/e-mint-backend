import { SettingsType } from '../../../lib/types/settings.types.js';
import Admin from '../admin/model.js';
import { HISTORY_ACTIONS } from './model.js';

const actionOptions = HISTORY_ACTIONS.map(value => ({
	value,
	label: value.charAt(0).toUpperCase() + value.slice(1),
}));

/**
 * Nothing here is editable. A history entry is a record of something that
 * already happened, so `edit: true` is deliberately absent on every field —
 * that is also what stops the generic update route from rewriting the log.
 */
const settings: SettingsType<any> = {
	text: {
		title: 'Activity',
		type: 'string',
		search: true,
		schema: {
			default: true,
			// Rendered by the `history` table cell, which makes the sentence a
			// button that opens the affected record in a drawer.
			type: 'history',
			viewType: 'history',
		},
	},

	action: {
		title: 'Action',
		type: 'string',
		sort: true,
		filter: {
			name: 'action',
			field: 'action_in',
			type: 'multi-select',
			label: 'Action',
			title: 'Filter by action',
			options: actionOptions,
		},
		schema: {
			default: true,
			// Not 'tag': that cell only renders arrays and silently draws nothing
			// for a scalar. The action is colour-coded by the dot in the Activity
			// cell anyway, so this column just needs the word.
			type: 'string',
			options: actionOptions,
		},
	},

	model: {
		title: 'Model',
		type: 'string',
		sort: true,
		search: true,
		filter: {
			name: 'model',
			field: 'model_in',
			type: 'multi-select',
			label: 'Model',
			title: 'Filter by model',
			category: 'distinct',
			key: 'model',
		},
		schema: { default: true },
	},

	userName: {
		title: 'User',
		type: 'string',
		sort: true,
		search: true,
		schema: { default: true },
	},

	user: {
		title: 'User Account',
		type: 'string',
		filter: {
			name: 'user',
			field: 'user_in',
			type: 'multi-select',
			label: 'User',
			title: 'Filter by user',
			category: 'model',
			model: Admin,
			key: 'name',
		},
		populate: { path: 'user', select: 'name email' },
		schema: { tableKey: 'user.name' },
	},

	documentName: { title: 'Record', type: 'string', search: true, schema: {} },
	documentCode: { title: 'Code', type: 'string', search: true, schema: { default: true } },
	modelPath: { title: 'Path', type: 'string', exclude: false, schema: {} },
	document: { title: 'Record Id', type: 'string', schema: {} },
	changes: { title: 'Changes', type: 'array-object', schema: { viewType: 'data-array' } },

	createdAt: {
		title: 'When',
		type: 'date',
		sort: true,
		filter: {
			name: 'createdAt',
			field: 'createdAt',
			type: 'date',
			label: 'Date',
			title: 'Filter by date',
		},
		schema: { default: true, type: 'date' },
	},
};

export default settings;
