import mongoose, { Schema } from 'mongoose';
import Type from './leads.type.js';

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
		category: {
			type: String,
			trim: true,
		},
		businessName: {
			type: String,
			trim: true,
		},
		position: {
			type: String,
			trim: true,
		},
		businessAddress: {
			type: String,
			trim: true,
		},
		city: {
			type: String,
			trim: true,
		},
		assignedTo: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Admin',
		},
		industry: {
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
		hasWebsite: {
			type: Boolean,
			default: false,
		},
		websiteUrl: {
			type: String,
			trim: true,
			required: function () {
				return !!this.hasWebsite;
			},
		},
		isActive: {
			type: Boolean,
			required: true,
			default: true,
		},

		tags: [
			{
				type: String,
			},
		],
		interestedIn: [
			{
				type: String,
			},
		],
		leadType: {
			type: String,
			enum: ['cold', 'warm', 'hot'],
			default: 'cold',
		},
		priority: {
			type: String,
			enum: ['low', 'medium', 'high'],
			default: 'medium',
		},
		estimatedBudget: {
			type: Number,
		},
		followUps: [
			{
				date: Date,
				note: String,
			},
		],
		source: {
			type: String,
		},
		status: {
			type: String,

			default: 'new',
			required: [true, 'Status is required'],
		},
		notes: [
			{
				type: String,
			},
		],
		isDeleted: {
			type: Boolean,
			default: false,
		},
	},
	{ timestamps: true }
);

const Lead = mongoose.model<Type>('Lead', schema);
export default Lead;
