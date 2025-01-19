import { SettingsType } from '../../lib/types/settings.types.js';
import { Types } from 'mongoose';
import Location from '../location/location.model.js';
import Product from '../products/inventory.settings.js';

type Type = {
	product?: Types.ObjectId;
	products?: {
		product?: Types.ObjectId;
		quantity?: number;
	}[];
	'products.product'?: Types.ObjectId;
	destination: Types.ObjectId;
	source?: Types.ObjectId;
	quantity?: number;
	reason: 'restock' | 'return' | 'relocation' | 'damage' | 'other';
	shop?: Types.ObjectId;
	date: Date;
	status?:
		| 'initiated'
		| 'completed'
		| 'cancelled'
		| 'pending'
		| 'approved'
		| 'failed'
		| 'rejected'
		| 'transit'
		| 'delivered'
		| 'received'
		| 'dispatched'
		| 'returned';
	type?: 'mtl' | 'ltl' | 'ltm';
	ref?: String;
};

const transferSettings: SettingsType<Type> = {
	date: {
		type: 'string',
		title: 'Date',
		sort: true,
		filter: {
			name: 'date',
			type: 'date',
			label: 'Date',
			title: 'Date',
		},
	},

	ref: {
		title: 'Ref',
		type: 'string',
		search: true,
	},
	product: {
		title: 'Product',
		type: 'array-object',
	},
	status: {
		title: 'Status',
		type: 'string',
		edit: true,
		sort: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Status',
			category: 'distinct',
			key: 'status',
		},
	},
	reason: {
		title: 'Reason',
		type: 'string',
		edit: true,
		sort: true,
		filter: {
			name: 'reason',
			field: 'reason_in',
			type: 'multi-select',
			label: 'Reason',
			title: 'reason',
			category: 'distinct',
			key: 'reason',
		},
	},
	type: {
		title: 'Type',
		type: 'string',
		edit: true,
		sort: true,
		filter: {
			name: 'type',
			field: 'type_in',
			label: 'Type',
			type: 'multi-select',
			title: 'Type',
			options: [
				{
					value: 'Mail To Location',
					label: 'mtl',
				},
				{
					value: 'Location To Location',
					label: 'ltl',
				},
				{
					value: 'Location To Mail',
					label: 'ltm',
				},
			],
		},
	},
	destination: {
		title: 'Destination',
		type: 'string',
		sort: true,
		populate: {
			path: 'destination',
			select: 'name',
		},
		filter: {
			name: 'destination',
			field: 'destination_in',
			type: 'multi-select',
			label: 'Destination',
			title: 'Destination',
			model: Location,
			category: 'model',
			key: 'name',
		},
	},
	'products.product': {
		type: 'string',
		populate: {
			path: 'products.product',
			// select: 'name',
			select: 'name',
		},
		title: 'Products',
		edit: true,
		sort: true,

		// filter: {
		// 	name: 'products.product',
		// 	field: 'products.product_in',
		// 	type: 'multi-select',
		// 	label: 'Location',
		// 	title: 'Sort by location',
		// 	category: 'model',
		// 	model: Product,
		// 	key: 'name',
		// },
	},
	source: {
		title: 'Source',
		type: 'string',
		sort: true,
		populate: {
			path: 'source',
			select: 'name',
		},
		filter: {
			name: 'source',
			field: 'source_in',
			type: 'multi-select',
			label: 'Source',
			title: 'Source',
			model: Location,
			category: 'model',
			key: 'name',
		},
	},
};

export default transferSettings;
