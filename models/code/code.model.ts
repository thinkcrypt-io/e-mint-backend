import mongoose, { Schema, Types } from 'mongoose';

const schema = new Schema<any>(
	{
		date: {
			type: Date,
			required: [true, 'Code Date is required'],
		},
		code: {
			type: String,
			trim: true,
			required: [true, 'Code is required'],
		},
		description: {
			type: String,
			trim: true,
		},

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},
	},

	{
		timestamps: true,
	}
);

const Code = mongoose.model<any>('Code', schema);
export { default as settings } from './code.settings.js';
export default Code;
