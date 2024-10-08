import { ProductSettings } from './products.types.js';
import Category from '../category/category.model.js';
import Collection from '../collection/collection.model.js';
import Brand from '../brand/brand.model.js';

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
		search: true,
		unique: true,
	},
	description: {
		type: 'string',
		title: 'Long Descripion',
		edit: true,
	},
	shortDescription: {
		type: 'string',
		title: 'Short Description',
		edit: true,
	},

	collection: {
		sort: true,
		edit: true,
		title: 'Collection',
		type: 'array-string',

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
	brand: {
		edit: true,
		sort: true,
		title: 'Brand',
		type: 'string',
		required: true,
		populate: {
			path: 'brand',
			select: 'name',
		},

		filter: {
			name: 'brand',
			field: 'brand_in',
			type: 'multi-select',
			label: 'Brand',
			title: 'Sort by Brand',
			options: [],
			category: 'model',
			model: Brand,
			key: 'name',
		},
	},
	image: {
		type: 'uri',
		title: 'Image',
		edit: true,
	},

	images: {
		type: 'array-string',
		title: 'Image',
		edit: true,
	},

	tags: {
		type: 'array-string',
		title: 'Tags',
		edit: true,
	},

	customAttributes: {
		type: 'array-object',
		title: 'Custom Attributes',
		edit: true,
	},
	customSections: {
		type: 'array-object',
		title: 'Custom Attributes',
		edit: true,
	},
	faq: {
		type: 'array-object',
		title: 'Custom Attributes',
		edit: true,
	},

	allowStock: {
		type: 'boolean',
		title: 'Allow Stock',
		edit: true,
		sort: true,
		filter: {
			name: 'Allow Stock',
			field: 'allowStock',
			type: 'boolean',
			label: 'Allow Stock',
			title: 'Sort by allow stock',
		},
	},

	stock: {
		type: 'number',
		title: 'Stock',
		edit: true,
		sort: true,
		filter: {
			name: 'Stock',
			field: 'stock',
			type: 'range',
			label: 'Stock',
			title: 'Sort by stock',
		},
	},

	lowStockAlert: {
		type: 'number',
		title: 'Low Stock Alert',
		edit: true,
		sort: true,
	},
	cost: {
		type: 'number',
		title: 'Cost Price',
		required: true,
		edit: true,
		sort: true,
		filter: {
			name: 'cost',
			field: 'cost',
			type: 'range',
			label: 'Cost',
			title: 'Sort by cost price',
		},
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
	status: {
		type: 'string',
		title: 'Status',
		edit: true,
		sort: true,
		filter: {
			name: 'Status',
			field: 'status',
			type: 'multi-select',
			label: 'Status',
			title: 'Sort by status',
			options: [
				{
					label: 'Published',
					value: 'published',
				},
				{
					label: 'Draft',
					value: 'draft',
				},
				{
					label: 'Archived',
					value: 'archived',
				},
			],
		},
	},
	discountType: {
		type: 'string',
		title: 'Discount Type',
		edit: true,
		sort: true,
		filter: {
			name: 'discountType',
			field: 'discountType',
			type: 'multi-select',
			label: 'Discount Type',
			title: 'Sort by discount type',
			options: [
				{
					label: 'Percentage',
					value: 'percentage',
				},
				{
					label: 'Flat',
					value: 'flat',
				},
			],
		},
	},
	discount: {
		type: 'number',
		title: 'Discounted Price',
		edit: true,
		sort: true,
		filter: {
			name: 'Discount',
			field: 'discount',
			type: 'boolean',
			label: 'Discount',
			title: 'Sort by discount',
		},
	},
	isFeatured: {
		type: 'boolean',
		title: 'Featured',
		edit: true,
		sort: true,
		filter: {
			name: 'Featured',
			field: 'isFeatured',
			type: 'boolean',
			label: 'Featured',
			title: 'Sort by featured',
		},
	},
	sku: {
		type: 'string',
		title: 'SKU',
		edit: true,
		search: true,
		sort: true,
	},
	barcode: {
		type: 'string',
		title: 'Barcode',
		edit: true,
		search: true,
	},
	slug: {
		type: 'string',
		title: 'Slug',
		edit: true,
		unique: true,
		search: true,
	},

	unit: {
		type: 'string',
		title: 'Unit',
		edit: true,
	},

	unitValue: {
		type: 'number',
		title: 'Unit Value',
		edit: true,
	},

	vat: {
		type: 'number',
		title: 'VAT',
		edit: true,
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
	meta: {
		title: 'Meta',
		type: 'object',
		edit: true,
	},
};

export default settings;
