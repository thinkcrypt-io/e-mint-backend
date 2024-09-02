//

import permissions from './permissions.js';

const settings = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Role Name',
		type: 'string',
		min: 3,
		max: 50,
		required: true,
		trim: true,
		unique: true,
	},
	description: {
		edit: true,
		type: 'string',
		title: 'Role Description',
		trim: true,
	},

	permissions: {
		edit: true,
		title: 'Permissions',
		type: 'array',
		filter: {
			name: 'permissions',
			type: 'multi-select',
			label: 'Permissions',
			title: 'Filter by permissions',
			options: permissions,
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

	image: {
		edit: true,
		title: 'Image',
		type: 'uri',
	},
};

export default settings;
