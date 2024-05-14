import { ProductSettings } from './items.types.js';
import Category from '../category/category.model.js';
import Collection from '../collection/collection.model.js';

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
		edit: true,
	},
	longDescription: {
		type: 'string',
		title: 'Long Description',
		edit: true,
	},
	restaurant: {
		type: 'object',

		title: 'Restaurant',
	},
	collection: {
		sort: true,
		edit: true,
		title: 'Collection',
		type: 'array-string',
		// populate: {
		// 	path: 'collection',
		// 	select: 'name',
		// },

		filter: {
			name: 'collection',
			field: 'collection_in',
			type: 'multi-select',
			label: 'Collection',
			title: 'Sort by collection',
			options: [],
			category: 'model',
			model: Collection,
			key: 'name',
		},
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
		edit: true,
	},

	tags: {
		type: 'array-string',
		title: 'Tags',
		edit: true,
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
	isDiscount: {
		type: 'boolean',
		edit: true,
		title: 'Discount',
		sort: true,
	},
	discountPrice: {
		type: 'number',
		title: 'Discounted Price',
		edit: true,
		sort: true,
	},
	isFeatured: {
		type: 'boolean',

		title: 'Featured',
	},
	time: {
		type: 'number',
		title: 'Cooking Time',
		edit: true,
		sort: true,
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
