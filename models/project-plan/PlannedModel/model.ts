import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		project: {
			type: Schema.Types.ObjectId,
			ref: 'PlannedProject',
			required: [true, 'Project is required'],
		},
	},
	{
		timestamps: true,
	}
);

const PlannedModel = mongoose.model<any>('PlannedModel', schema);

export default PlannedModel;
