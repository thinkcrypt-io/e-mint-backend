//

import SettingType from '../../lib/types/settings.types.js';

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
};

export default settings;
