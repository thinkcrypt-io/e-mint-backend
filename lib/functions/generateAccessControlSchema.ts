import { Schema } from 'mongoose';
import Admin from '../../models/admin/admin.model.js';
import { SettingsType } from '../types/settings.types.js';

const privacyOptions = [
	{
		value: 'public',
		label: 'Public',
	},
	{
		value: 'private',
		label: 'Private',
	},
	{
		value: 'only-me',
		label: 'Only Me',
	},
];

export const accessControlSchema = {
	privacy: {
		type: String,
		enum: ['public', 'private', 'only-me'],
		default: 'private',
	},
	addedBy: {
		type: Schema.Types.ObjectId,
		ref: 'Admin',
	},
	access: [
		{
			type: Schema.Types.ObjectId,
			ref: 'Admin',
		},
	],
};

export const accessControlSettings: SettingsType<any> = {
	privacy: {
		title: 'Privacy',
		type: 'string',
		edit: true,
		sort: true,
		required: true,
		filter: {
			name: 'privacy',
			field: 'privacy_in',
			type: 'multi-select',
			label: 'Privacy',
			title: 'Sort By Privacy',
			options: privacyOptions,
		},
		schema: {
			type: 'select',
			options: privacyOptions,
			sort: true,
			default: true,
		},
	},
	addedBy: {
		edit: true,
		title: 'Added By',
		type: 'string',
		sort: true,
		filter: {
			name: 'addedBy',
			field: 'addedBy_in',
			type: 'multi-select',
			label: 'Added By',
			title: 'Sort by added by',
			category: 'model',
			model: Admin,
			key: 'name',
		},

		populate: {
			path: 'addedBy',
			select: 'name email',
		},

		schema: {
			tableKey: 'addedBy.name',
		},
	},
	access: {
		edit: true,
		title: 'Access',
		type: 'array-string',

		sort: true,
		filter: {
			name: 'access',
			field: 'access_in',
			type: 'multi-select',
			label: 'Access',
			title: 'Sort by access',
			category: 'model',
			model: Admin,
			key: 'name',
		},
		schema: {
			type: 'data-tag',
			viewType: 'data-array-tag',
			model: 'admins',
			modelAddOn: 'email',
			tooltip: 'Users who can access this document',
		},
	},
};

const ACCESS_CONTROL = {
	SCHEMA: accessControlSchema,
	SETTINGS: accessControlSettings,
};

export default ACCESS_CONTROL;
