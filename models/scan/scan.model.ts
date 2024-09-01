import mongoose, { Schema, Types } from 'mongoose';

const schema = new Schema<any>(
	{
		value: {
			type: Number,
			required: true,
			default: 0,
		},

		// restaurant: {
		// 	type: mongoose.Schema.Types.ObjectId,
		// 	ref: 'Restaurant',
		// },
		device: {
			type: String,
		},
		ip: {
			type: String,
		},
	},

	{
		timestamps: true,
	}
);

const Scan = mongoose.model<any>('Scan', schema);

export default Scan;
