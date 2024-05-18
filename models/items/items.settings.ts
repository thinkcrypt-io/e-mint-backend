import { ProductSettings } from './items.types.js';
import Category from '../category/category.model.js';
import Collection from '../collection/collection.model.js';

/**
 * settings file
 * fields for the product model
 * @type : which is the type of the field eg: string, number, boolean, object, array
 * @required : which is a boolean value to check if the field is required or not while creating
 * @title : which is the title of the field specially when throwing error messages
 * @edit : which is a boolean value to check if the field is editable or not,
 * 		   if false the field will be read only
 * @search : which is a boolean value to check if the field is searchable or not
 * @sort : which is a boolean value to check if the field is sortable or not with filters
 * @populate : which is an object to populate the field with the data from the other model
 * @unique : which is a boolean value to which prevents from creating duplicate values in model
 * @trim : which is a boolean value to trim the field while creating
 * @min : which is a number to check the minimum value of the field
 * @max : which is a number to check the maximum value of the field
 * @filter : which is an object to filter the field with the data from the other model
 *   - name : which is the name of the filter
 * 	 - field : which is the field name to filter
 * 	 - type : which is the type of the filter eg: 'multi-select' | 'range' | 'boolean' | 'date'
 * 	 - label : which is the label of the filter
 * 	 - title : which is the title of the filter
 * 	 - options : which is the options of the filter
 * 	 - category : which is the category of the filter
 * 	 - model : which is the model of the filter
 * 	 - key : which is the key of the filter
 *   - roles : which is the roles of the filter
 *
 */

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
		filter: {
			name: 'Price',
			field: 'price',
			type: 'range',
			label: 'Price',
			title: 'Sort by price',
		},
	},
	isActive: {
		type: 'boolean',
		edit: true,
		title: 'Active Status',
		sort: true,
		filter: {
			name: 'active',
			field: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by active',
		},
	},
	isDiscount: {
		type: 'boolean',
		edit: true,
		title: 'Discount',
		sort: true,
		filter: {
			name: 'Discount',
			field: 'isDiscount',
			type: 'boolean',
			label: 'Discount',
			title: 'Sort by discount',
		},
	},
	discountPrice: {
		type: 'number',
		title: 'Discounted Price',
		edit: true,
		sort: true,
		filter: {
			name: 'Discounted Price',
			field: 'discountPrice',
			type: 'range',
			label: 'Discounted Price',
			title: 'Sort by discount price',
		},
	},
	isFeatured: {
		type: 'boolean',
		title: 'Featured',
		filter: {
			name: 'Featured',
			field: 'isFeatured',
			type: 'boolean',
			label: 'Featured',
			title: 'Sort by featured',
		},
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
	createdAt: {
		type: 'string',
		title: 'Created At',
		sort: true,
		filter: {
			name: 'Created At',
			field: 'createdAt',
			type: 'date',
			label: 'Created At',
			title: 'Sort by created at',
		},
	},
};

export default settings;
