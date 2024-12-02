import mongoose, { Schema } from 'mongoose';

type Type = {
	otp: string;
	recipient: string;
	isActive: boolean;
	shop: string;
};

const schema = new Schema<Type>(
	{
		otp: {
			type: String,
			required: true,
		},
		recipient: {
			type: String,
			required: [true, 'Recipient number is required'],
		},
		isActive: {
			type: Boolean,
			required: true,
			default: true,
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
	}
);

const Otp = mongoose.model<Type>('Otp', schema);
export default Otp;
