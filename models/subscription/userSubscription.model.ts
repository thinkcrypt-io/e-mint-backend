import mongoose, { Schema, Types } from 'mongoose';
import { SettingsType } from '../../imports.js';

const schema = new Schema<Type>(
	{
		customer: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Customer',
			required: [true, 'Customer is required'],
		},
		subscription: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Subscription',
			required: [true, 'Subscription is required'],
		},
		start: {
			type: Date,
			required: [true, 'Start date is required'],
			default: Date.now,
		},
		end: {
			type: Date,
			required: [true, 'End date is required'],
		},
		renewal: {
			type: Date,
			required: [true, 'Renewal date is required'],
		},
		purchaseDate: {
			type: Date,
			required: [true, 'Purchase date is required'],
			default: Date.now,
		},
		isPaid: {
			type: Boolean,
			default: false,
			required: true,
		},
		status: String,

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		addedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
		},
	},

	{
		timestamps: true,
	}
);

type Type = {
	customer: Types.ObjectId;
	subscription: Types.ObjectId;
	start: Date;
	end: Date;
	renewal: Date;
	isPaid: Boolean;
	price: number;
	purchaseDate: Date;
	isActive: boolean;
	features?: string[];
	status?: 'active' | 'expired' | 'calcelled' | 'refunded' | 'pending' | 'failed';
	createdAt?: Date;
	addedBy?: Types.ObjectId;
};

export const userSubscriptionSettings: SettingsType<Type> = {
	customer: {
		title: 'Customer',
		type: 'string',
		required: true,
	},
	subscription: {
		title: 'Subscription',
		type: 'string',
		required: true,
	},
	start: {
		type: 'string',
		title: 'Start Date',
	},
	end: {
		type: 'string',
		title: 'End Date',
	},
	renewal: {
		type: 'string',
		title: 'Renewal Date',
	},

	purchaseDate: {
		type: 'string',
		title: 'Purchase Date',
	},

	isPaid: {
		type: 'boolean',
		title: 'Paid',
	},

	price: {
		title: 'Price',
		type: 'number',
	},
	status: {
		title: 'Status',
		type: 'string',
	},
	isActive: {
		title: 'Active',
		type: 'boolean',
	},

	addedBy: {
		title: 'Added By',
		type: 'string',
	},

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
	},
};

const UserSubscription = mongoose.model<Type>('UserSubscription', schema);
export default UserSubscription;
