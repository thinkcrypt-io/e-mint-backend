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
		amount: {
			type: Number,
			required: true,
		},
		project: {
			type: Schema.Types.ObjectId,
			ref: 'Software',
		},
		details: {
			type: String,
		},

		category: {
			type: String,
		},
		date: {
			type: Date,
			required: true,
			default: Date.now,
		},
		tags: [String],
		receipt: String,
		note: {
			type: String,
			trim: true,
		},

		...ACCESS_CONTROL.SCHEMA,
	},

	{
		timestamps: true,
	}
);

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'adminexpense' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'adminexpense' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `EXP-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const AdminExpense = mongoose.model<any>('AdminExpense', schema);
export default AdminExpense;
