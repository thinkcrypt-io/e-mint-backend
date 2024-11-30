import { AssetType } from './index.js';
import { filters, SettingsType } from '../../imports.js';

const assetSettings: SettingsType<AssetType> = {
	name: {
		type: 'string',
		required: true,
		title: 'Name',
		search: true,
		sort: true,
		edit: true,
	},
	description: {
		type: 'string',
		title: 'Description',
		search: true,
		edit: true,
	},
	price: {
		type: 'number',
		title: 'Price',
		edit: true,
		required: true,
	},
	qty: {
		type: 'number',
		title: 'Quantity',
		edit: true,
	},
	forcedSellPrice: {
		type: 'number',
		title: 'Forced Sell Price',
		edit: true,
	},
	note: {
		type: 'string',
		title: 'Note',
		edit: true,
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
		search: true,
	},
	createdAt: {
		type: 'string',
		title: 'Created At',
		sort: true,
		filter: filters?.createdAt,
	},
	isDeleted: {
		type: 'boolean',
		title: 'Is Deleted',
		edit: true,
	},
	value: {
		type: 'number',
		title: 'Value',
		edit: true,
	},
};

export default assetSettings;
