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
	restaurant: {
		edit: true,
		title: 'Restaurant',
		type: 'string',
	},
	username: {
		unique: true,
		search: true,
		sort: true,
		title: 'Username',
		type: 'text',
	},
	email: {
		unique: true,
		search: true,
		sort: true,
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
		title: 'User Role',
		type: 'text',
		// filter: {
		// 	name: 'role',
		// 	field: 'role_in',
		// 	type: 'multi-select',
		// 	label: 'Roles',
		// 	title: 'Sort by role',
		// 	options: [
		// 		{
		// 			label: 'Admin',
		// 			value: 'admin',
		// 		},
		// 		{
		// 			label: 'Employee',
		// 			value: 'employee',
		// 		},
		// 		{
		// 			label: 'User',
		// 			value: 'user',
		// 		},
		// 		{
		// 			label: 'Super Admin',
		// 			value: 'super-admin',
		// 		},
		// 	],
		// },
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
	},
};

export default settings;
