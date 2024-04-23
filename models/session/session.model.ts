import mongoose, { Schema, Types } from 'mongoose';

const schema = new Schema<any>(
	{
		employee: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'User is required'],
		},

		code: {
			type: Schema.Types.ObjectId,
			ref: 'Code',
		},

		date: {
			type: Date,
			required: [true, 'Date is required'],
		},

		start: {
			type: Date,
			required: [true, 'Start date is required'],
		},

		end: {
			type: Date,
		},

		status: {
			type: String,
			enum: ['completed', 'active', 'on-leave', 'late/early', 'half-day', 'field', 'wfh'],
			default: 'pending',
			required: true,
		},

		lateCheckIn: {
			type: Boolean,
		},

		earlyCheckOut: {
			type: Boolean,
		},

		completed: {
			type: Boolean,
			default: false,
			required: true,
		},

		halfDay: {
			type: Boolean,
		},

		note: [String],

		hours: {
			type: Number,
			required: true,
			default: 0,
		},

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},
	},

	{
		timestamps: true,
	}
);

const Session = mongoose.model<any>('Session', schema);
export { default as settings } from './session.settings.js';
export default Session;
