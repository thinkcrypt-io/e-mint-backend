import { AdminRole, SettingsType } from '../../imports.js';
import Role from '../role/role.model.js';

import Shop from '../shop/shop.model.js';

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
	},

	username: {
		sort: true,
		title: 'Username',
		type: 'text',
	},
	email: {
		unique: true,
		search: true,
		sort: true,
		edit: true,
		title: 'Email',
		type: 'email',
		required: true,
	},
	phone: {
		search: true,
		edit: true,
		title: 'Phone',
		type: 'text',
	},

	role: {
		edit: true,
		sort: true,
		title: 'User Role',
		type: 'text',
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

	password: {
		type: 'text',
		title: 'Password',
		min: 8,
		exclude: true,
	},
};

export default settings;
