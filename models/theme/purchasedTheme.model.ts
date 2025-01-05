import { Shop } from '../index.js';
import { SettingsType } from '../../lib/types/settings.types.js';
import mongoose, { Schema, Types } from 'mongoose';
// import { CategoryType } from './category.type.js';

type ModelType = {
	theme: Types.ObjectId;
	shop: Types.ObjectId;
	price: number;
	isActivated: boolean;
	activatedAt: Date;
	isDeployed: boolean;
	deployment: Types.ObjectId;
	name: string;
};

const schema = new Schema<ModelType>(
	{
		theme: {
			type: Schema.Types.ObjectId,
			ref: 'Theme',
			required: true,
		},
		name: {
			type: String,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},
		price: {
			type: Number,
			required: true,
			default: 0,
		},
		isActivated: {
			type: Boolean,
			default: false,
		},
		activatedAt: {
			type: Date,
		},
		isDeployed: {
			type: Boolean,
			default: false,
		},
		deployment: {
			type: Schema.Types.ObjectId,
			ref: 'Deployment',
		},
	},

	{
		timestamps: true,
	}
);

export type PurchasedThemeType = ModelType;

const PurchasedTheme = mongoose.model<ModelType>('PurchasedTheme', schema);
export default PurchasedTheme;

export const purchasedThemeSettings: SettingsType<ModelType> = {
	theme: {
		title: 'Theme',
		type: 'string',
		sort: true,
		populate: {
			path: 'theme',
			select: 'name',
		},
	},
	name: {
		title: 'Name',
		type: 'string',
	},
	shop: {
		title: 'Shop',
		type: 'string',
		sort: true,
		populate: {
			path: 'shop',
			select: 'name',
		},
		filter: {
			name: 'shop',
			field: 'shop_in',
			type: 'multi-select',
			category: 'model',
			model: Shop,
			label: 'Shop',
			title: 'Shop',
			key: 'name',
		},
	},
	price: {
		title: 'Price',
		type: 'number',
		sort: true,
	},
	isActivated: {
		title: 'Is Activated',
		type: 'boolean',
		sort: true,
	},
	activatedAt: {
		title: 'Activated At',
		type: 'string',
		sort: true,
	},
	isDeployed: {
		title: 'Is Deployed',
		type: 'boolean',
		sort: true,
	},
	deployment: {
		title: 'Deployment',
		type: 'string',
		sort: true,
		populate: {
			path: 'deployment',
			select: 'vercelName',
		},
	},
};
