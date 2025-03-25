import { Admin, SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	subject: {
		title: 'Subject',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: { sort: false, default: true },
	},
	title: {
		title: 'Title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			sort: true,
			default: true,
			helperText:
				'This is the text that goes in the email title, leave it blank if you are unsure, default: Thinkcrypt.io | We Build Digital Experience',
		},
	},
	recipients: {
		title: 'Recipients',
		type: 'mixed',
		sort: false,
		search: false,
		schema: { sort: false, default: false },
	},
	to: {
		title: 'To',
		type: 'array',
		schema: { sort: false, default: false, type: 'tag' },
	},
	cc: {
		title: 'CC',
		type: 'array',
		schema: { sort: false, default: false, type: 'tag' },
	},
	bcc: {
		title: 'BCC',
		type: 'array',
		schema: { sort: false, default: false, type: 'tag' },
	},

	createdBy: {
		title: 'Sent By',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		populate: { path: 'createdBy', select: 'name' },
		filter: {
			name: 'createdBy',
			field: 'createdBy_in',
			type: 'multi-select',
			category: 'model',
			model: Admin,
			key: 'name',
			label: 'Created by',
			title: 'Filter by Created by',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'createdBy.name',
			model: 'users',
		},
	},
	body: {
		title: 'Body',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: { sort: false, default: false, type: 'textarea' },
	},
	attachment: {
		title: 'Attachment',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		schema: { sort: false, default: false, type: 'file' },
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: { name: 'createdAt', type: 'date', label: 'Created at', title: 'Filter by Created at' },
		schema: { type: 'date', tableType: 'date-only' },
	},
};

export default settings;
