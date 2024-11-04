import mongoose, { Schema, Types } from 'mongoose';
import { SettingsType, filters } from '../../imports.js';

const schema = new Schema<Type>(
	{
		name: {
			type: String,
			trim: true,
			required: [true, 'Name is required'],
		},
		amount: {
			type: Number,
			required: [true, 'Amount is required'],
			default: 0,
		},
		isDiscounted: {
			type: Boolean,
			default: false,
		},
		discountedPrice: {
			type: Number,
		},
		currency: {
			type: String,
			required: [true, 'Currency is required'],
			default: 'BDT',
		},
		duration: {
			type: Number,
			required: [true, 'Duration is required'],
			default: 3,
		},

		billingCycle: {
			type: String,
			enum: ['monthly', 'yearly', 'custom'],
			default: 'monthly',
			required: [true, 'Billing cycle is required'],
		},
		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		tags: [String],
		features: [String],

		addedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
		},
		note: String,
	},

	{
		timestamps: true,
	}
);

type Type = {
	name: string;
	amount: number;
	duration: number;
	tags?: string[];
	note?: string;
	currency?: string;
	createdAt: Date;
	addedBy?: Types.ObjectId;
	isActive?: boolean;
	features?: string[];
	billingCycle: 'monthly' | 'yearly' | 'custom';
	isDiscounted: boolean;
	discountedPrice?: number;
};

export const subscriptionSettings: SettingsType<Type> = {
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
		title: 'Price',
		type: 'number',
		required: true,
	},
	isDiscounted: {
		edit: true,
		title: 'Discounted',
		type: 'boolean',
	},
	discountedPrice: {
		edit: true,
		title: 'Discounted Price',
		type: 'number',
	},

	isActive: {
		edit: true,
		title: 'Active',
		type: 'boolean',
		sort: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by active',
		},
	},

	duration: {
		edit: true,
		title: 'Duration',
		type: 'number',
		required: true,
	},

	currency: {
		title: 'Currency',
		type: 'string',
	},
	billingCycle: {
		edit: true,
		title: 'Billing Cycle',
		type: 'string',
		sort: true,
		required: true,
		filter: {
			name: 'billingCycle',
			field: 'billingCycle_in',
			type: 'multi-select',
			label: 'Billing Cycle',
			title: 'Sort by billing cycle',
			options: [
				{ label: 'Monthly', value: 'monthly' },
				{ label: 'Yearly', value: 'yearly' },
				{ label: 'Custom', value: 'custom' },
			],
		},
	},

	note: {
		edit: true,
		type: 'string',
		title: 'Note',
	},

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
	},
	features: {
		edit: true,
		title: 'Features',
		type: 'array-string',
	},

	tags: {
		edit: true,
		sort: true,
		title: 'Tags',
		type: 'array-string',
		filter: filters.tags,
	},
	addedBy: {
		title: 'Added By',
		type: 'string',
	},
};

const Subscription = mongoose.model<Type>('Subscription', schema);
export default Subscription;
