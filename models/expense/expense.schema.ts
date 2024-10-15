import { required } from 'joi';
import mongoose, { Schema, Types } from 'mongoose';
// import { CategoryType } from './category.type.js';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			trim: true,
			required: true,
		},
		amount: {
			type: Number,
			required: true,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},

		category: {
			type: Types.ObjectId,
			ref: 'ExpenseCategory',
		},
		date: {
			type: Date,
			required: true,
			default: Date.now,
		},
		tags: [String],
		note: {
			type: String,
			trim: true,
		},
	},

	{
		timestamps: true,
	}
);

const Expense = mongoose.model<any>('Expense', schema);
export { default as settings } from './expense.settings.js';
export default Expense;
