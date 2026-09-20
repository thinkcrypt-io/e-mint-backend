import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		accountName: {
			type: String,
			required: [true, 'Account name is required'],
			trim: true,
		},
		accountNumber: {
			type: String,
			required: [true, 'Account number is required'],
			trim: true,
		},
		bankName: {
			type: String,
			required: [true, 'Bank name is required'],
			trim: true,
		},
		branch: {
			type: String,
			trim: true,
		},
		routingNumber: {
			type: String,
			trim: true,
		},
		isDefault: {
			type: Boolean,
			default: false,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

// Only one default bank account at a time — the invoice PDF's Bank Details
// block reads whichever one is marked default, so more than one would make
// that pick ambiguous.
schema.pre<any>('save', async function (next) {
	if (this.isDefault) {
		await mongoose
			.model('PaymentMethod')
			.updateMany({ _id: { $ne: this._id }, isDefault: true }, { $set: { isDefault: false } });
	}
	next();
});

export default mongoose.model<any>('PaymentMethod', schema);
