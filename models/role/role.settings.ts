//

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
