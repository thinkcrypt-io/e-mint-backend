import { required } from 'joi';
import mongoose, { Schema } from 'mongoose';
import { ShopFaqType } from './shopFaq.types';

const schema = new Schema<ShopFaqType>(
	{
		question: {
			type: String,
			required: [true, 'Question is required'],
		},

		answer: {
			type: String,
			required: [true, 'Answer is required'],
		},
		shop: {
			type: mongoose.Schema.Types.ObjectId,
			// required: [true, 'Shop id is required'],
		},
	},

	{
		timestamps: true,
	}
);

const ShopFaq = mongoose.model<any>('ShopFaq', schema);
// export { ShopFaqSettings as settings } from './shopFaq.settings.js';
export { default as settings } from './shopFaq.settings.js';
export default ShopFaq;
