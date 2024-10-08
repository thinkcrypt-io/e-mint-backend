// models/InventoryAdjustment.js
import { Product, Settings } from '../../imports.js';
import mongoose, { Types, Schema } from 'mongoose';

const schema = new Schema<InventoryAdjustmentType>(
	{
		product: {
			type: Schema.Types.ObjectId,
			ref: 'Product',
			required: true,
		},
		change: {
			type: Number,
			required: true,
		},
		value: {
			type: Number,
		},
		reason: {
			type: String,
			enum: ['damage', 'stock-correction', 'other'],
			required: true,
		},
		note: { type: String, trim: true },
		// adjustedBy: {
		// 	type: mongoose.Schema.Types.ObjectId,
		// 	ref: 'User', // Assuming you have a User model
		// 	required: true,
		// },
	},
	{ timestamps: true }
);

const InventoryAdjustment = mongoose.model<InventoryAdjustmentType>('InventoryAdjustment', schema);

export const settings: Settings = {
	product: {
		title: 'Product',
		type: 'string',
		required: true,
		sort: true,
		populate: {
			path: 'product',
			select: 'name cost',
		},
		filter: {
			name: 'product',
			field: 'product_id',
			type: 'multi-select',
			label: 'Product',
			title: 'Sort By Product',
			category: 'model',
			model: Product,
			key: 'name',
		},
	},
	change: {
		title: 'Change',
		type: 'number',
		required: true,
		edit: true,
		sort: true,
		filter: {
			name: 'change',
			field: 'change',
			type: 'range',
			label: 'Quantity',
			title: 'Sort By Quantity',
		},
	},
	reason: {
		title: 'Reason',
		type: 'string',
		required: true,
		edit: true,
		sort: true,
	},
	value: {
		title: 'Value',
		type: 'number',
		edit: true,
		sort: true,
	},
	note: {
		title: 'Note',
		type: 'string',
		required: true,
		edit: true,
	},
};

export default InventoryAdjustment;

type InventoryAdjustmentType = {
	product: Types.ObjectId;
	change: number;
	reason: string;
	note: string;
	value: number;
	// adjustedBy: string;
};
