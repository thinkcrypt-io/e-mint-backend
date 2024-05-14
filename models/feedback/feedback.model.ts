import { required } from 'joi';
import mongoose, { Schema, Types } from 'mongoose';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: true,
		},
		email: {
			type: String,
		},
		phone: {
			type: String,
			trim: true,
			required: [true, 'User phone number required'],

			validate: {
				validator: function (v: string) {
					// Regular expression that matches a string that starts with '01' and is followed by exactly 9 digits
					const regex = /^01[0-9]{9}$/;
					return regex.test(v);
				},
				message: props => `${props.value} is not a valid phone number!`,
			},
		},
		title: {
			type: String,
		},
		description: {
			type: String,
			required: true,
		},

		rating: {
			type: Number,
			required: true,
		},

		customer: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Customer',
		},

		restaurant: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Restaurant',
		},
	},

	{
		timestamps: true,
	}
);

const Feedback = mongoose.model<any>('Feedback', schema);

export { default as settings } from './feedback.settings.js';
export default Feedback;
