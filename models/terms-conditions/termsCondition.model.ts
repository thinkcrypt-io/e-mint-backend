import mongoose, { Schema, Document } from 'mongoose';
import { TermConditionType } from './termsCondition.types.js';


const TermsConditionSchema: Schema = new Schema<TermConditionType>(
	{
	
		body: { type: String, required: true },
		// views: { type: Number, default: 0 },
		
	},
	{ timestamps: true }
);

const TermsCondition = mongoose.model<TermConditionType>('TermsCondition', TermsConditionSchema);
export { default as settings } from './termsCondition.settings.js';
export default TermsCondition;