import { SettingsType } from '../../imports.js';
import SidebarCategory from '../sidebarcategories/model.js';

const settings: SettingsType<any> = {
	name: {
		unique: true,
		title: 'Title',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	href: {
		title: 'Href',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	icon: {
		title: 'Icon',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'image',
		},
	},
	iconDark: {
		title: 'Icon dark',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'image',
		},
	},
	category: {
		title: 'Category',
		type: 'string',
		sort: true,
		search: false,
		edit: true,
		required: true,
		populate: {
			path: 'category',
			select: 'name isActive priority',
		},
		filter: {
			name: 'category',
			field: 'category_in',
			type: 'multi-select',
			category: 'model',
			model: SidebarCategory,
			key: 'name',
			label: 'Category',
			title: 'Filter by Category',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'category.name',
			model: 'sidebarcategories',
			default: true,
			sort: true,
			addItem: true,
		},
	},
	tooltip: {
		title: 'Tooltip',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	priority: {
		title: 'Priority',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	isActive: {
		title: 'Is Active',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Is active',
			title: 'Filter by Is active',
		},
		schema: {
			label: 'Status',
			type: 'select',
			options: [
				{
					value: true,
					label: 'Active',
				},
				{
					value: false,
					label: 'Disabled',
				},
			],
			tableType: 'checkbox',
			default: true,
			sort: true,
			displayValue: {
				true: 'Active',
				false: 'Disabled',
			},
		},
	},
	permissionProtected: {
		title: 'Permission Required',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'permissionProtected',
			type: 'boolean',
			label: 'Permission protected',
			title: 'Filter by Permission protected',
		},
		schema: {
			default: true,
			sort: true,
			displayValue: {
				true: 'Yes',
				false: 'No',
			},
		},
	},
	permission: {
		title: 'Permission',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
			copy: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Created at',
			title: 'Filter by Created at',
		},
		schema: {
			type: 'date-only',
			tableType: 'string',
		},
	},
};

export default settings;
