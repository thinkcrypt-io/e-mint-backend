import Type from './staff.types.js';
import Location from '../location/location.model.js';

import Shop from '../shop/shop.model.js';
import { SettingsType } from '../../imports.js';

const settings: SettingsType<Type> = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		min: 3,
		max: 50,
		required: true,
		trim: true,
	},
	shop: {
		title: 'Shop',
		type: 'string',
		populate: {
			path: 'shop',
			select: 'name email',
		},
		sort: true,
		filter: {
			name: 'shop',
			field: 'shop_in',
			roles: ['admin'],
			type: 'multi-select',
			label: 'Shops',
			title: 'Sort by shop',
			category: 'model',
			model: Shop,
			key: 'name',
		},
	},

	location: {
		title: 'Location',
		type: 'string',
		populate: {
			path: 'location',
			select: 'name',
		},
		sort: true,
		filter: {
			name: 'location',
			field: 'location_in',
			type: 'multi-select',
			label: 'Locations',
			title: 'Sort by location',
			category: 'model',
			model: Location,
			key: 'name',
		},
	},

	email: {
		unique: true,
		search: true,
		sort: true,
		edit: true,
		title: 'Email',
		type: 'email',
		required: true,
	},
	phone: {
		unique: true,
		search: true,
		edit: true,
		title: 'Phone',
		type: 'text',
	},

	role: {
		edit: true,
		sort: true,
		title: 'User Role',
		type: 'text',
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
	isDeleted: {
		edit: true,
		type: 'boolean',
		title: 'Active Status',
		sort: true,
	},

	password: {
		type: 'text',
		title: 'Password',
		min: 8,
		exclude: true,
	},
};

export default settings;
