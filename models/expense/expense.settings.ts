//

import { filters, Location } from '../../imports.js';
import SettingType from '../../lib/types/settings.types.js';
import ExpenseCategory from './expenseCategory.model.js';

//import Category from './category.model.js';

type Settings = {
	[key: string]: SettingType;
};

const settings: Settings = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
	},
	location: {
		type: 'string',
		title: 'Location',
		sort: true,
		populate: {
			path: 'location',
			select: 'name',
		},
		filter: {
			name: 'location',
			field: 'location_in',
			type: 'multi-select',
			label: 'Location',
			title: 'Sort by location',
			category: 'model',
			model: Location,
			key: 'name',
		},
	},

	amount: {
		edit: true,
		type: 'number',
		title: 'Amount',

		sort: true,
		filter: {
			name: 'amount',
			field: 'amount',
			type: 'range',
			label: 'Amount',
			title: 'Sort by amount',
		},
	},

	note: {
		edit: true,
		type: 'string',
		title: 'Note',
	},

	date: {
		sort: true,
		type: 'string',
		title: 'Date',
		required: true,
		filter: {
			name: 'date',
			field: 'date',
			type: 'date',
			label: 'Date',
			title: 'Sort by expense date',
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
			category: 'model',
			model: ExpenseCategory,
			label: 'Category',
			title: 'Sort by Expense Category',
			key: 'name',
		},
	},

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
	},

	tags: {
		edit: true,
		sort: true,
		title: 'Tags',
		type: 'array-string',
		filter: filters.tags,
	},
};

export default settings;
