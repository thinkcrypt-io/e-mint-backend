import mongoose, { Schema, Types } from 'mongoose';
import LeaveType from './leave.type.js';

const schema = new Schema<LeaveType>(
	{
		employee: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		leaveType: {
			type: String,
			required: true,
			enum: ['annual', 'sick', 'hd', 'maternity', 'casual', 'ul', 'other'],
		},
		startDate: {
			type: Date,
			required: true,
		},
		endDate: {
			type: Date,
			required: true,
		},
		status: {
			type: String,
			required: true,
			enum: ['pending', 'approved', 'rejected', 'cancelled'],
			default: 'pending',
		},
		reason: {
			type: String,
		},
		days: {
			type: Number,
			required: true,
		},
		trackingId: {
			type: String,
			required: true,
		},
		approvedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
		},
		appliedOn: {
			type: Date,
			default: Date.now,
		},
		comments: {
			type: String,
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

const Leave = mongoose.model<LeaveType>('Leave', schema);
export { default as settings } from './leave.settings.js';
export default Leave;
