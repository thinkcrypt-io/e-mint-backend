import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		sort: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	position: {
		title: 'Position',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	bio: { title: 'Bio', type: 'string', search: true, edit: true, schema: { type: 'textarea' } },
	profilePicture: {
		title: 'Profile picture',
		type: 'uri',
		edit: true,
		required: true,
		trim: true,
		schema: {
			type: 'image',
		},
	},
	skills: {
		title: 'Skills',
		type: 'array',
		edit: true,
		schema: { type: 'tag' },
	},
	experienceInYears: {
		title: 'Experience in years',
		type: 'number',
		edit: true,
		schema: {
			sort: true,
		},
	},
	priority: {
		title: 'Priority',
		type: 'number',
		edit: true,
		required: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	email: {
		title: 'Email',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			copy: true,
			default: true,
			sort: true,
		},
	},
	phone: {
		title: 'Phone',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{ label: 'Active', value: 'active' },
				{ label: 'Former', value: 'former' },
			],
		},
		schema: {
			default: true,
			sort: true,
			type: 'select',
			options: [
				{ label: 'Active', value: 'active' },
				{ label: 'Former', value: 'former' },
			],
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
			title: 'Filter by Active Status',
		},
		schema: { sort: true },
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		edit: true,
		schema: { type: 'date', tableType: 'date-only', sort: true, default: true },
	},
};

export default settings;
