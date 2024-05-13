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
};

export default settings;
