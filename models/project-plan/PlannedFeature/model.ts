import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{},
	{
		timestamps: true,
	}
);

const PlannedFeature = mongoose.model<any>('PlannedFeature', schema);

export default PlannedFeature;
