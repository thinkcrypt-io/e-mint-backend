import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		description: { type: String, default: '', trim: true },
		path: { type: String, required: true, trim: true, lowercase: true, unique: true },

		fields: {
			title: { type: String, required: true, trim: true },
			type: {
				type: String,
				default: 'string',
				enum: [
					'string',
					'email',
					'uri',
					'date',
					'array-string',
					'boolean',
					'number',
					'text',
					'object',
					'array-number',
					'array',
					'array-object',
				],
			},
			sort: {
				type: Boolean,
				default: false,
			},
			search: { type: Boolean, default: false },
			edit: { type: Boolean, default: true },
			unique: { type: Boolean, default: false },
			required: { type: Boolean, default: false },
			trim: { type: Boolean, default: false },
			exclude: { type: Boolean, default: false },
			min: { type: Number },
			max: { type: Number },
			populate: { type: Object },
			schema: { type: Object },
			filter: {
				type: {
					name: String,
					label: String,
					type: {
						type: String,
						enum: ['multi-select', 'range', 'boolean', 'date', 'text', 'select'],
					},
					options: [{ label: String, value: String }],
					category: { type: String, enum: ['model', 'distinct'] },
					model: { type: Schema.Types.Mixed },
					key: String,
					roles: [String],
					field: String,
				},
			},
		},

		isDisabled: { type: Boolean, default: false },

		sch: {
			type: String,
			required: true,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('Setting', schema);
