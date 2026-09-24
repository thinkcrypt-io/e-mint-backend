import mongoose, { Schema } from 'mongoose';

/**
 * The builder's global switch: whether routes run on their published DB
 * copies or on their code files, for settings and config separately. A
 * route's own `source` ('db' / 'code') overrides this; 'inherit' follows it.
 *
 * One document, key 'global'. With no document at all, both default to 'db'
 * — which is what every route does once it has a published copy.
 */
const schema = new Schema<any>(
	{
		key: { type: String, required: true, unique: true, default: 'global' },
		settings: { type: String, enum: ['db', 'code'], default: 'db' },
		config: { type: String, enum: ['db', 'code'], default: 'db' },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
	},
	{ timestamps: true, versionKey: false }
);

export default mongoose.model<any>('BuilderState', schema, 'builderstate');
