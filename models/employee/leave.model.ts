import mongoose, { Schema, model, Document, Types } from 'mongoose';
import LeaveType from './leave.types.js';
import Counter from '../counter/counter.model.js';

const schema = new Schema<LeaveType>(
	{
		code: {
			type: String,
			trim: true,
			unique: true,
		},
		employee: {
			type: Schema.Types.ObjectId,
			ref: 'Admin',
			required: true,
		},
		leaveType: {
			type: String,
			required: true,
			enum: ['annual', 'sick', 'casual', 'unpaid', 'half-day'],
		},
		startDate: {
			type: Date,
			required: true,
		},
		endDate: {
			type: Date,
		},
		numberOfDays: {
			type: Number,
			required: true,
		},
		reason: {
			type: String,
		},
		status: {
			type: String,
			required: true,
			enum: ['pending', 'approved', 'rejected', 'cancelled'],
			default: 'pending',
		},
		addedBy: {
			type: Schema.Types.ObjectId,
			ref: 'Admin',
		},
		access: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Admin',
			},
		],
		attachment: {
			type: String,
		},
	},
	{
		timestamps: true, // Automatically creates and manages createdAt and updatedAt
	}
);

let isNew = false;

schema.pre<any>('save', function (next) {
	isNew = this.isNew;
	next();
});

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'leave' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'leave' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `LV-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Leave = mongoose.model<LeaveType>('Leave', schema);

export default Leave;
