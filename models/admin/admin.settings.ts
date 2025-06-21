import { AdminRole, SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		edit: true,
		sort: true,
		search: true,

		title: 'Name',
		type: 'string',
		min: 3,
		max: 50,
		required: true,
		trim: true,
		schema: {
			displayInTable: true,
			default: true,
			isRequired: true,
		},
	},

	username: {
		sort: true,
		title: 'Username',
		type: 'text',
		search: true,
	},
	email: {
		unique: true,
		search: true,
		sort: true,
		edit: true,
		title: 'Email',
		type: 'email',
		required: true,
		schema: {
			displayInTable: true,
			default: true,
		},
	},
	phone: {
		search: true,
		edit: true,
		title: 'Phone',
		type: 'text',
		schema: {
			displayInTable: true,
			default: true,
		},
	},

	role: {
		edit: true,
		sort: true,
		title: 'Role',
		type: 'text',
		schema: {
			displayInTable: true,
			default: true,
			type: 'data-menu',
			model: 'adminroles',
			tableKey: 'role.name',
			isRequired: true,
		},
		populate: {
			path: 'role',
			select: 'name',
		},
		filter: {
			name: 'role',
			field: 'role_in',
			type: 'multi-select',
			label: 'Roles',
			title: 'Sort by role',
			category: 'model',
			roles: ['seller'],
			model: AdminRole,
			key: 'name',
		},
	},

	isActive: {
		edit: true,
		type: 'boolean',
		title: 'Active Status',
		sort: true,
		schema: {
			displayInTable: true,
		},

		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by active status',
		},
	},
	isDeleted: {
		edit: true,
		type: 'boolean',
		title: 'Active Status',
		sort: true,
	},
	github: {
		edit: true,
		title: 'Github Username',
		type: 'string',
	},

	password: {
		type: 'text',
		title: 'Password',
		min: 8,
		exclude: true,
	},
};

export default settings;
