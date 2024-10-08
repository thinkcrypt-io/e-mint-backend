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
	},

	{
		timestamps: true,
	}
);

const ExpenseCategory = mongoose.model<any>('ExpenseCategory', schema);

export const settings = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
	},
};

export default ExpenseCategory;
