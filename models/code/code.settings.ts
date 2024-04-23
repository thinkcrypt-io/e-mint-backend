//

const settings = {
	date: {
		sort: true,
		search: true,
		title: 'Date',
		type: 'date',
		required: true,
		filter: {
			name: 'date',
			type: 'date',
			label: 'Code Date',
			title: 'Sort by code date',
		},
	},
	description: {
		edit: true,
		type: 'string',
		title: 'Code Description',
		trim: true,
	},

	code: {
		edit: true,
		search: true,
		type: 'string',
		title: 'Code',
		trim: true,
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
};

export default settings;
