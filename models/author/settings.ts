import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Author Name',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	image: {
		title: 'Avatar Image',
		type: 'uri',
		edit: true,
		schema: {
			type: 'image',
		},
	},
	bio: {
		title: 'Short Bio',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	email: {
		title: 'Email',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	createdAt: {
		title: 'Created At',
		type: 'date',
		sort: true,
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Created At',
			title: 'Filter by Created Date',
		},
		schema: {
			type: 'date',
			tableType: 'date-only',
		},
	},
};

export default settings;
