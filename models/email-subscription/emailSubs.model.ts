import mongoose, { Schema } from 'mongoose';

const emailSubscriptionSchema = new Schema<any>(
	{
		email: { type: String, required: true },
		shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true }
);

const EmailSubscription = mongoose.model(
	'EmailSubscription',
	emailSubscriptionSchema
);
export default EmailSubscription;
export { default as settings } from './emailSubs.settings.js';
