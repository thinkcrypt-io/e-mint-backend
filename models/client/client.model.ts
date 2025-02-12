import mongoose, { Schema } from 'mongoose';
import Type from './client.types.js';

const schema = new Schema<Type>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
			min: 3,
			max: 50,
		},
		email: {
			type: String,
			trim: true,
			lowercase: true,
		},
		phone: {
			type: String,
			trim: true,
		},
		address: {
			type: String,
		},
		city: {
			type: String,
			trim: true,
		},
		country: {
			type: String,
			trim: true,
		},
		website: {
			type: String,
			trim: true,
		},
		industry: {
			type: String,
			trim: true,
		},

		contactPerson: {
			type: String,
			trim: true,
		},
		notes: [String],

		status: {
			type: String,
			required: [true, 'Status is required'],
		},
		description: {
			type: String,
			trim: true,
		},
	},
	{ timestamps: true }
);

const Client = mongoose.model<Type>('Client', schema);
export default Client;
