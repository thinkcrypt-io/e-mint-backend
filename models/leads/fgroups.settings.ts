import { SettingsType } from '../../lib/types/settings.types.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	category: {
		title: 'Category',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		trim: true,
		filter: {
			name: 'category',
			field: 'category_in',
			type: 'multi-select',
			label: 'Category',
			title: 'Filter by Category',
			options: [
				{
					label: 'Business to business',
					value: 'businessToBusiness',
				},
				{
					label: 'Business to customer',
					value: 'businessToCustomer',
				},
				{
					label: 'Startups',
					value: 'startups',
				},
				{
					label: 'Developers',
					value: 'developers',
				},
				{
					label: 'Investors',
					value: 'investors',
				},
				{
					label: 'Ecommerce',
					value: 'ecommerce',
				},
				{
					label: 'Others',
					value: 'others',
				},
			],
		},
		schema: {
			sort: true,
			default: true,
			type: 'select',
			options: [
				{
					label: 'Business to business',
					value: 'businessToBusiness',
				},
				{
					label: 'Business to customer',
					value: 'businessToCustomer',
				},
				{
					label: 'Startups',
					value: 'startups',
				},
				{
					label: 'Developers',
					value: 'developers',
				},
				{
					label: 'Investors',
					value: 'investors',
				},
				{
					label: 'Ecommerce',
					value: 'ecommerce',
				},
				{
					label: 'Others',
					value: 'others',
				},
			],
		},
	},
	url: {
		title: 'Url',
		type: 'uri',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			type: 'string',
			tableType: 'external-link',
			viewType: 'external-link',
			default: true,
		},
	},
	members: {
		title: 'Members',
		type: 'number',
		search: false,
		edit: true,
		schema: {
			sort: true,
		},
	},
	priority: {
		title: 'Priority',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		trim: true,
		filter: {
			name: 'priority',
			field: 'priority_in',
			type: 'multi-select',
			label: 'Priority',
			title: 'Filter by Priority',
			options: [
				{ label: 'Hot', value: 'hot' },
				{ label: 'High', value: 'high' },
				{ label: 'Medium', value: 'medium' },
				{ label: 'Low', value: 'low' },
				{ label: 'Archived', value: 'archived' },
			],
		},
		schema: {
			default: true,
			sort: true,
			type: 'select',
			options: [
				{ label: 'Hot', value: 'hot' },
				{ label: 'High', value: 'high' },
				{ label: 'Medium', value: 'medium' },
				{ label: 'Low', value: 'low' },
				{ label: 'Archived', value: 'archived' },
			],
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		search: false,
		edit: true,
		schema: { type: 'date', tableType: 'date-only', sort: true },
	},
};

export default settings;
