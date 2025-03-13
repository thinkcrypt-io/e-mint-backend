import mongoose, { Schema } from 'mongoose';
import { ACCESS_CONTROL } from '../../lib/index.js';
import Counter from '../counter/counter.model.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,
		},
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		plan: {
			type: String,
			trim: true,
		},
		currency: {
			type: String,
			enum: ['bdt', 'usd', 'eur', 'other'],
			required: [true, 'Currency is required'],
		},
		amount: {
			type: Number,
			required: [true, 'Amount is required'],
		},
		status: {
			type: String,
			enum: ['active', 'inactive', 'expired', 'cancelled'],
		},
		billingCycle: {
			type: String,
			enum: ['monthly', 'yearly', 'trial', 'custom'],
		},
		renewDate: Date,
		lastPaymentDate: Date,
		autoRenew: {
			type: Boolean,
			default: false,
		},
		accountLogin: {
			type: String,
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
			let counter = await Counter.findOne({ slug: 'adminsubscription' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'adminsubscription' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `SBS-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const BillSubscription = mongoose.model<any>('BillSubscription', schema);
export default BillSubscription;
