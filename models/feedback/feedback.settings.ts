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
	},

	description: {
		title: 'Description',
		type: 'string',
		min: 10,
		max: 50,
		trim: true,
	},

	phone: {
		title: 'Phone',
		type: 'string',
		min: 11,
		max: 11,
	},

	email: {
		title: 'Email',
		type: 'email',
	},

	rating: {
		title: 'Rating',
		type: 'number',
		required: true,
	},

	image: {
		edit: true,
		title: 'Image',
		type: 'uri',
	},
};

export default settings;
