const settings = {
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
		unique: true,
	},
	// dataKey: {
	// 	edit: true,
	// 	sort: true,
	// 	search: true,
	// 	title: 'Data Key',
	// 	type: 'string',
	// 	min: 3,
	// 	max: 50,
	// 	required: true,
	// 	trim: true,
	// 	unique: true,
	// },
	description: {
		edit: true,
		title: 'Description',
		type: 'string',
		min: 10,
		max: 50,
		trim: true,
	},

	priority: {
		edit: true,
		sort: true,
		title: 'Priority',
		type: 'number',
		filter: {
			name: 'priority',
			type: 'range',
			label: 'Priority',
			title: 'Sort by Importance',
		},
	},
	isActive: {
		edit: true,
		sort: true,
		type: 'boolean',
		title: 'Active Status',

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

	images: {
		type: 'array-string',
		title: 'Image',
		edit: true,
	},

	isFeatured: {
		edit: true,
		sort: true,
		type: 'boolean',
		title: 'Featured Status',

		filter: {
			name: 'isFeatured',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by featured',
		},
	},
	displayInHome: {
		edit: true,
		type: 'boolean',
		title: 'Display In Home Page',
		sort: true,

		filter: {
			name: 'displayInHome',
			type: 'boolean',
			label: 'Display In Home Page',
			title: 'Display In Home Page',
		},
	},
	displayInMenu: {
		edit: true,
		type: 'boolean',
		title: 'Display In Menu',
		sort: true,

		filter: {
			name: 'displayInMenu',
			type: 'boolean',
			label: 'Display In Menu',
			title: 'Display In Menu',
		},
	},
	shop: {
		title: 'Shop',
		type: 'string',
	},
	meta: {
		edit: true,
		title: 'Meta',
		type: 'object',
	},
};

export default settings;
