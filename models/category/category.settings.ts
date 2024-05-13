//

import { CategorySettings } from './category.type.js';

const settings: CategorySettings = {
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

	restaurant: {
		edit: true,
		title: 'Restaurant',
		type: 'string',
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
