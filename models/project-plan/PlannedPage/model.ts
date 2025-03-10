import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{},
	{
		timestamps: true,
	}
);

const PlannedPage = mongoose.model<any>('PlannedPage', schema);

export default PlannedPage;
