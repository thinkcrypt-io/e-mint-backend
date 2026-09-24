import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		description: { type: String, default: '', trim: true },
		path: { type: String, required: true, trim: true, lowercase: true, unique: true },
		fields: { type: Array, default: [] },
		// Optional: only 6 of the ~80 generic routes have a Model document to
		// point at, and nothing reads this beyond the list table's label.
		model: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Model',
		},
		// Overrides for the route's `export` flag and add button in code.
		// Unset means the code config decides; getPageRoute applies them.
		showExport: { type: Boolean },
		showAddButton: { type: Boolean },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('TableConfig', schema);
