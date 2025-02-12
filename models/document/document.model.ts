import mongoose, { Schema } from 'mongoose';
import Type from './document.types.js';

const schema = new Schema<Type>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
			min: 3,
			max: 50,
		},
		client: {
			type: Schema.Types.ObjectId,
			ref: 'Client',
		},
		docUrl: {
			type: String,
			trim: true,
		},
		fileUrl: {
			type: String,
			trim: true,
		},
		category: {
			type: String,
			trim: true,
		},
		direction: {
			type: String,
			trim: true,
			enum: ['inbound', 'outbound', 'internal', 'other'],
		},
		tags: [String],

		project: {
			type: Schema.Types.ObjectId,
			ref: 'Project',
		},
		addedBy: {
			type: Schema.Types.ObjectId,
			ref: 'Admin',
		},
	},
	{ timestamps: true }
);

const Doc = mongoose.model<Type>('Document', schema);
export default Doc;
