import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
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
		title: 'Image',
		type: 'uri',
		edit: true,
		schema: {
			type: 'image',
		},
	},
	bio: {
		title: 'Bio',
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
		required: false,
		trim: true,
		schema: {
			type: 'email',
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
			tableType: 'string',
			readonly: true,
		},
	},
};

export default settings;
