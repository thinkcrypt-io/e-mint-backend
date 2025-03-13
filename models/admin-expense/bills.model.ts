import mongoose, { Schema } from 'mongoose';
import Counter from '../counter/counter.model.js';
import { ACCESS_CONTROL } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,
			trim: true,
		},
		name: {
			type: String,
			trim: true,
			required: true,
		},
		currency: {
			type: String,
			enum: ['bdt', 'usd', 'eur', 'other'],
			required: [true, 'Currency is required'],
		},
		amount: {
			type: Number,
			required: true,
		},
		status: {
			type: String,
			enum: ['due', 'paid', 'over-due', 'void'],
		},

		details: {
			type: String,
		},
		refNo: String,
		dueDate: Date,
		billDate: Date,
		paidAt: Date,

		category: {
			type: String,
		},

		receipt: String,
		tags: [String],
		note: {
			type: String,
			trim: true,
		},

		...ACCESS_CONTROL.SCHEMA,
	},

	{
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
		timestamps: true,
	}
);

schema.virtual('overDuration').get(function (this: any) {
	if (this.status === 'paid') return null;
	if (this.status === 'void') return null;
	if (!this.dueDate) return `0 days`;

	if (this.dueDate.getTime() > Date.now()) return null;

	const diff = Date.now() - this.dueDate.getTime();
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	return `${days} days`;
});

schema.virtual('dueIn').get(function (this: any) {
	if (this.status != 'due') return null;

	if (!this.dueDate) return `0 days`;

	const diff = this.dueDate.getTime() - Date.now();
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	return `${days} days`;
});

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'bill' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'bill' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `BL-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Bill = mongoose.model<any>('Bill', schema);
export default Bill;
