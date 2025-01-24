import { SettingsType } from '../../lib/types/settings.types.js';
import LocationType from './location.types.js';

const locationSettings: SettingsType<LocationType> = {
	name: {
		title: 'Name',
		type: 'string',
		required: true,
		search: true,
		edit: true,
		unique: true,
	},
	image: {
		title: 'Image',
		type: 'uri',
		edit: true,
	},
	shortDescription: {
		title: 'Short Description',
		type: 'string',
		edit: true,
	},
	description: {
		title: 'Description',
		type: 'string',
		edit: true,
	},
	address: {
		title: 'Address',
		type: 'string',
		edit: true,
	},
	isActive: {
		title: 'Active',
		type: 'boolean',
		edit: true,
	},
	phone: {
		title: 'Phone',
		type: 'string',
		edit: true,
		search: true,
	},
	email: {
		title: 'Email',
		type: 'string',
		edit: true,
		search: true,
	},
	shop: {
		title: 'Shop',
		type: 'string',
	},
	tags: {
		title: 'Tags',
		type: 'array-string',
		edit: true,
	},
};

export default locationSettings;
