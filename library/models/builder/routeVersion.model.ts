import mongoose, { Schema } from 'mongoose';

/**
 * One published version of a RouteSettings or RouteConfig, kept so any
 * earlier version can be inspected or restored. Written on every publish and
 * before a reset to code; never edited.
 */
const schema = new Schema<any>(
	{
		route: { type: String, required: true, trim: true, index: true },
		// 'model': a model-builder definition, snapshotted before each change.
		kind: { type: String, enum: ['settings', 'config', 'model'], required: true },
		version: { type: Number, required: true },
		data: { type: Schema.Types.Mixed },
		note: { type: String, trim: true },
		publishedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

schema.index({ route: 1, kind: 1, version: -1 });

export default mongoose.model<any>('RouteVersion', schema, 'routeversions');
