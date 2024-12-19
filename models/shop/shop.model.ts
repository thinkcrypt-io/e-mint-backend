import mongoose, { Schema } from 'mongoose';
import { ShopType } from './index.js';
import Counter from '../counter/counter.model.js';

const schema = new Schema<ShopType>(
	{
		id: {
			type: String,
			unique: true,
		},
		url: {
			type: String,
			trim: true,
		},
		deployment: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Deployment',
		},
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},

		shippingCharge: {
			type: Number,
			default: 0,
			required: true,
		},

		template: {
			type: Number,
			default: 1,
			required: true,
		},

		logo: {
			type: String,
			trim: true,
			default: 'https://thinkcrypt.io/e-mint/icon9.png',
		},

		image: {
			type: String,
			trim: true,
		},

		coverImage: {
			type: String,
			trim: true,
		},

		location: {
			type: String,
			trim: true,
		},
		address: {
			type: String,
			trim: true,
		},

		email: {
			type: String,
			trim: true,
			required: [true, 'Email is required'],
		},

		expire: {
			type: Date,
			required: true,
		},

		trial: {
			type: Boolean,
			default: true,
			required: true,
		},

		phone: {
			type: String,
			trim: true,
		},

		owner: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
		},

		package: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'UserSubscription',
			// required: true,
		},

		isDeleted: {
			type: Boolean,
			default: false,
			required: true,
		},

		smsBalance: {
			type: Number,
			default: 0.0,
			required: true,
		},

		smsExpense: {
			type: Number,
			default: 0.0,
			required: true,
		},

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},
		website: {
			type: String,
			trim: true,
		},
		facebook: {
			type: String,
			trim: true,
		},
		instagram: {
			type: String,
			trim: true,
		},
		linkedin: {
			type: String,
			trim: true,
		},
		youtube: {
			type: String,
			trim: true,
		},
		daraz: {
			type: String,
			trim: true,
		},
		twitter: {
			type: String,
			trim: true,
		},
		whatsapp: {
			type: String,
			trim: true,
		},
		tiktok: {
			type: String,
			trim: true,
		},
		telegram: {
			type: String,
			trim: true,
		},
		faq: [
			{
				title: { type: String },
				description: { type: String },
			},
		],
		terms: [String],
	},

	{
		timestamps: true,
		toJSON: { virtuals: true },
	}
);

schema.virtual('isExpired').get(function (this: ShopType) {
	return this.expire < new Date();
});

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'shop' });
			if (!counter) counter = new Counter({ sequenceValue: 9, slug: 'shop' });

			counter.sequenceValue += 1;
			await counter.save();

			this.id = counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Shop = mongoose.model<ShopType>('Shop', schema);
export { ShopType as ModelType } from './index.js';
export default Shop;
// export { shopSettings as settings } from './index.js';
