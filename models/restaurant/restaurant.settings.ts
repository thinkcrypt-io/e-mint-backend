//

import { RestaurantSettings } from './restaurant.type.js';

const settings: any = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
	},

	description: {
		edit: true,
		type: 'string',
		title: 'Description',
	},

	logo: {
		type: 'uri',
		title: 'Logo',
		edit: true,
	},

	coverImage: {
		type: 'string',
		title: 'Cover Image',
	},

	image: {
		type: 'uri',
		title: 'Image',
		edit: true,
	},

	location: {
		edit: true,
		type: 'string',
		title: 'Location',
	},

	email: {
		edit: true,

		type: 'email',
		title: 'Email',
	},

	phone: {
		edit: true,
		type: 'string',
		title: 'Phone',
	},

	// template: {
	// 	edit: true,
	// 	title: 'Template',
	// },

	membership: {
		edit: true,
		type: 'string',
		title: 'Membership',
	},

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
		filter: {
			name: 'Date',
			field: 'createdAt',
			type: 'date',
			label: 'Session Date',
			title: 'Sort by date',
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
