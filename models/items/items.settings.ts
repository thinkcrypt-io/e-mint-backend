import { ProductSettings } from './items.types.js';
import Category from '../category/category.model.js';

const settings: ProductSettings = {
	name: {
		type: 'string',
		required: true,
		title: 'Name',
		edit: true,
	},
	description: {
		type: 'string',
		title: 'Description',
	},
	restaurant: {
		type: 'object',

		title: 'Restaurant',
	},
	category: {
		edit: true,
		sort: true,
		title: 'Category',
		type: 'string',
		required: true,
		populate: {
			path: 'category',
			select: 'name',
		},

		filter: {
			name: 'category',
			field: 'category_in',
			type: 'multi-select',
			label: 'Category',
			title: 'Sort by category',
			options: [],
			category: 'model',
			model: Category,
			key: 'name',
		},
	},
	image: {
		type: 'uri',
		title: 'Image',
	},

	price: {
		type: 'number',
		title: 'Price',
		required: true,
		edit: true,
		sort: true,
	},
	isActive: {
		type: 'boolean',
		edit: true,
		title: 'Active Status',
		sort: true,
	},
	isFeatured: {
		type: 'boolean',

		title: 'Featured',
	},
	isDeleted: {
		type: 'boolean',
		title: 'Deleted',
	},
	isVisible: {
		type: 'boolean',
		title: 'Visible',
	},
};

export default settings;
