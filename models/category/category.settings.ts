//

import Category from './category.model.js';
import { CategorySettings } from './category.type.js';
//import Category from './category.model.js';

const settings: CategorySettings = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
		unique: true,
	},

	image: {
		edit: true,
		type: 'uri',
		title: 'Image',
	},
	parent: {
		edit: true,
		sort: true,
		title: 'Parent Category',
		type: 'string',
		populate: {
			path: 'parent',
			select: 'name',
		},
		filter: {
			name: 'parent',
			field: 'parent_in',
			type: 'multi-select',
			label: 'Parent Category',
			title: 'Sort by parent category',
			category: 'model',
			model: Category,
			key: 'name',
		},
	},

	parentCategory: {
		edit: true,
		sort: true,
		title: 'Parent Category',
		type: 'string',
		populate: {
			path: 'parentCategory',
			select: 'name',
		},
		filter: {
			name: 'parentCategory',
			field: 'parentCategory_in',
			type: 'multi-select',
			label: 'Parent Category',
			title: 'Sort by parent category',
			category: 'model',
			model: Category,
			key: 'name',
		},
	},

	description: {
		edit: true,
		type: 'string',
		title: 'Description',
	},

	shortDescription: {
		edit: true,
		type: 'string',
		title: 'Short Description',
	},

	longDescription: {
		edit: true,
		type: 'string',
		title: 'Short Description',
	},

	slug: {
		edit: true,
		type: 'string',
		title: 'Slug',
		trim: true,
		search: true,
	},

	priority: {
		edit: true,
		sort: true,
		type: 'number',
		title: 'Priority',
		filter: {
			name: 'priority',
			field: 'priority',
			type: 'range',
			label: 'Priority',
			title: 'Sort by priority',
		},
	},

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
	},

	isDeleted: {
		edit: true,
		type: 'boolean',
		title: 'Active Status',
		sort: true,
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

	displayInHomePage: {
		edit: true,
		type: 'boolean',
		title: 'Display In Home Page',
		sort: true,

		filter: {
			name: 'displayInHomePage',
			type: 'boolean',
			label: 'Display In Home Page',
			title: 'Display In Home Page',
		},
	},

	tags: {
		edit: true,
		sort: true,
		title: 'Tags',
		type: 'array-string',
		filter: {
			name: 'tags',
			field: 'tags_in',
			type: 'multi-select',
			label: 'Tag',
			title: 'Sort by Tag',
			category: 'distinct',
			key: 'tags',
		},
	},

	isFeatured: {
		edit: true,
		type: 'boolean',
		title: 'Featured Status',
		sort: true,

		filter: {
			name: 'isFeatured',
			type: 'boolean',
			label: 'Featured',
			title: 'Sort by active status',
		},
	},
	meta: {
		title: 'Meta',
		type: 'object',
		edit: true,
	},
	metaImage: {
		type: 'uri',
		title: 'Image',
		edit: true,
	},

	metaKeywords: {
		type: 'array-string',
		title: 'Tags',
		edit: true,
	},
};

export default settings;
