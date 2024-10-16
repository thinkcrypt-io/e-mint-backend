import { SettingsType, filters } from '../../imports.js';
import { ShopType } from './index.js';

import User from '../user/user.model.js';

const shopSettings: SettingsType<ShopType> = {
	id: {
		type: 'string',
		required: true,
		title: 'ID',
		search: true,
		sort: true,
		edit: true,
		filter: {
			name: 'id',
			field: 'id',
			type: 'text',
			label: 'ID',
			title: 'Find by ID',
		},
	},
	name: {
		type: 'string',
		required: true,
		title: 'Name',
		search: true,
	},
	owner: {
		type: 'string',
		title: 'Owner',
		edit: true,
		populate: {
			path: 'owner',
			select: 'name email phone',
		},
		sort: true,
		// filter: {
		// 	name: 'owner',
		// 	field: 'owner_in',
		// 	type: 'multi-select',
		// 	label: 'Owner',
		// 	title: 'Find by Owner',
		// 	category: 'model',
		// 	model: User,
		// },
	},
	description: {
		type: 'string',
		title: 'Description',
	},
	template: {
		type: 'number',
		title: 'Template',
		edit: true,
	},
	logo: {
		type: 'uri',
		title: 'Logo',
	},
	image: {
		type: 'uri',
		title: 'Image',
	},
	coverImage: {
		type: 'uri',
		title: 'Cover Image',
	},
	location: {
		type: 'string',
		title: 'Location',
	},
	address: {
		type: 'string',
		title: 'Address',
	},
	email: {
		type: 'string',
		required: true,
		title: 'Email',
		search: true,
	},
	expire: {
		type: 'string',
		required: true,
		title: 'Expire',
		edit: true,
	},
	trial: {
		type: 'boolean',
		title: 'Trial',
		edit: true,
		sort: true,
	},
	phone: {
		type: 'string',
		title: 'Phone',
	},
	package: {
		type: 'object',
		title: 'Package',
		edit: true,
	},
	isDeleted: {
		type: 'boolean',
		title: 'Is Deleted',
		edit: true,
		sort: true,
	},
	isActive: {
		type: 'boolean',
		title: 'Is Active',
		edit: true,
		sort: true,
		filter: filters.isActive,
	},
	createdAt: {
		type: 'string',
		title: 'Created At',
		sort: true,
		filter: filters.createdAt,
	},
};

export default shopSettings;
