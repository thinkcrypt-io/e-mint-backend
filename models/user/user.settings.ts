import Role from '../role/role.model.js';
import { UserSettings } from './user.types.js';

const settings: UserSettings = {
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
	// restaurant: {
	// 	edit: true,
	// 	title: 'Restaurant',
	// 	type: 'string',
	// },
	username: {
		// search: true,
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
			model: Role,
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

		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by active status',
		},
	},

	password: {
		type: 'text',
		title: 'Password',
		min: 8,
		exclude: true,
	},
};

export default settings;
