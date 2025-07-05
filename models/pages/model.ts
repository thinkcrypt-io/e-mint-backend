import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		subTitle: { type: String, default: '', trim: true },
		path: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
		},
		export: { type: Boolean, default: false },
		showAddButton: { type: Boolean, default: false },

		buttonTitle: { type: String, default: '', trim: true },
		buttonIsModal: { type: Boolean, default: false },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('Page', schema);
