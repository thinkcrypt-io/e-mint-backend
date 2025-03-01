import mongoose, { Document, Schema, Types } from 'mongoose';
import ProjectType from './types';
import ACCESS_CONTROL from '../../lib/functions/generateAccessControlSchema';

const schema = new Schema<ProjectType>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
			minlength: 3,
			maxlength: 50,
		},

		category: {
			type: String,
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		client: {
			type: Schema.Types.ObjectId,
			ref: 'Client',
		},

		status: {
			type: String,
			trim: true,
			default: 'pending',
		},
		requirements: {
			type: String,
			trim: true,
		},
		file: {
			type: String,
			trim: true,
		},
		fileUrl: {
			type: String,
			trim: true,
		},
		startDate: {
			type: Date,
		},
		endDate: {
			type: Date,
		},
		deadline: {
			type: Date,
		},
		tags: [String],

		isActive: {
			type: Boolean,
			default: true,
		},
		...ACCESS_CONTROL.SCHEMA,
		// addedBy: {
		// 	type: Schema.Types.ObjectId,
		// 	ref: 'Admin',
		// },
		// access: [{ type: Schema.Types.ObjectId, ref: 'Admin' }],
	},
	{ timestamps: true }
);

const Software = mongoose.model<ProjectType>('Software', schema);
export default Software;
