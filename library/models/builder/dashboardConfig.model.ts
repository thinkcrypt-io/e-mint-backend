import mongoose, { Schema } from 'mongoose';

/**
 * The admin dashboard, as the dashboard builder saves it: its widgets in
 * order — numbers, charts and recent-item lists, each reading one route.
 * One document, key 'default'. With none, the dashboard shows its built-in
 * cards (admin app/page.tsx).
 */
const schema = new Schema<any>(
	{
		key: { type: String, required: true, unique: true, default: 'default' },
		widgets: { type: [Schema.Types.Mixed], default: [] },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

export default mongoose.model<any>('DashboardConfig', schema, 'dashboardconfigs');
