import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{},
	{
		timestamps: true,
	}
);

const PlannedModel = mongoose.model<any>('PlannedModel', schema);

export default PlannedModel;
