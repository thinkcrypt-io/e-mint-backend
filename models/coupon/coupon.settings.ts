import { SettingsType, Shop } from '../../imports.js';
import CouponType from './coupon.type.js';

const settings: SettingsType<CouponType> = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
	},
	description: {
		edit: true,
		type: 'string',
		title: 'Description',
		search: true,
		trim: true,
	},
	code: {
		search: true,
		sort: true,
		type: 'string',
		title: 'Coupon Code',
		unique: true,
		required: true,
		trim: true,
		min: 4,
		filter: {
			name: 'code',
			type: 'text',
			label: 'Coupon Code',
			title: 'Filter by Coupon Code',
		},
	},
	shop: {
		sort: true,
		title: 'Shop',
		type: 'string',

		filter: {
			name: 'shop',
			type: 'multi-select',
			label: 'Shop',
			title: 'Filter by Shop',
			category: 'model',
			model: Shop,
			key: 'name',
			field: 'shop_in',
			roles: ['admin'],
		},
	},
	isActive: {
		edit: true,
		type: 'boolean',
		title: 'Active',
		sort: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Filter by Active',
		},
	},
	isFlat: {
		type: 'boolean',
		title: 'Flat',
		sort: true,
		filter: {
			name: 'isFlat',
			type: 'boolean',
			label: 'Flat',
			title: 'Filter by Flat',
		},
	},
	maxAmount: {
		type: 'number',
		title: 'Max Amount',
		sort: true,
		edit: true,
		filter: {
			name: 'maxAmount',
			field: 'maxAmount',
			type: 'range',
			label: 'Max Amount',
			title: 'Filter by Max Amount',
		},
	},
	minOrderValue: {
		type: 'number',
		title: 'Min Order Value',
		edit: true,
	},
	validFrom: {
		type: 'string',
		title: 'Valid From',
		required: true,
		sort: true,
		filter: {
			name: 'validFrom',
			field: 'validFrom',
			type: 'date',
			label: 'Valid From',
			title: 'Filter by Valid From',
		},
	},
	validTill: {
		type: 'string',
		title: 'Valid Till',
		required: true,
		sort: true,
		filter: {
			name: 'validTill',
			field: 'validTill',
			type: 'date',
			label: 'Valid Till',
			title: 'Filter by Valid Till',
		},
	},
	maxUse: {
		type: 'number',
		title: 'Max Use',
		edit: true,
	},
	percentage: {
		type: 'number',
		title: 'Percentage',
		edit: true,
	},
	image: {
		type: 'uri',
		title: 'Image',
		edit: true,
	},
	addedBy: {
		type: 'string',
		title: 'Added By',
	},
	maxUsePerUser: {
		type: 'number',
		title: 'Max Use Per User',
		edit: true,
	},
};

export default settings;
