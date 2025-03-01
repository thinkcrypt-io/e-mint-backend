import mongoose, { Schema } from 'mongoose';
import Counter from '../counter/counter.model.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,
			trim: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		project: {
			type: Schema.Types.ObjectId,
			ref: 'Software',
		},

		description: {
			type: String,
			trim: true,
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
			enum: ['active', 'pending', 'ended', 'on-hold', 'extended', 'cancelled'],
			default: 'active',
		},
		attachment: {
			type: String,
		},
		priority: {
			type: String,
			enum: ['low', 'medium', 'high', 'critical'],
			default: 'medium',
		},
	},
	{
		timestamps: true,
	}
);

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'maintenance' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'maintenance' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `M-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Maintenance = mongoose.model<any>('Maintenance', schema);
export default Maintenance;
