import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: [true, 'Field name is required'],
			trim: true,
		},
		model: {
			type: Schema.Types.ObjectId,
			ref: 'PlannedModel',
		},
		project: {
			type: Schema.Types.ObjectId,
			ref: 'PlannedProject',
		},
		description: {
			type: String,
			trim: true,
		},
		type: {
			type: String,
			enum: ['String', 'Number', 'Date', 'Boolean', 'ObjectId', 'Array', 'Object'],
		},
		required: {
			type: Boolean,
			default: false,
		},
		default: {
			type: String,
			trim: true,
		},
		ref: {
			type: String,
			trim: true,
		},
		enum: {
			type: [String],
		},
		trim: {
			type: Boolean,
			default: false,
		},
		lowercase: {
			type: Boolean,
			default: false,
		},

		unique: {
			type: Boolean,
			default: false,
		},
		match: {
			type: String,
			trim: true,
		},
		isImmutable: {
			type: Boolean,
			default: false,
		},
		note: {
			type: String,
			trim: true,
		},
		//Business logic
		// search: { type: Boolean, default: false },
		// sort: { type: Boolean, default: false },

		// // UI hints
		// label: { type: String },
		// placeholder: { type: String },
		// helperText: { type: String },
		// inputType: { type: String }, // UI input type
	},
	{
		timestamps: true,
	}
);

const ModelAttribute = mongoose.model<any>('ModelAttribute', schema);

export default ModelAttribute;
