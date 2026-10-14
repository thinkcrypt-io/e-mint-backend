import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One run of an automation (docs/automations): what started it, each action's
 * result, and why it failed or was skipped. Kept 30 days. Scoped to the project.
 */
const schema = new Schema<any>(
	{
		automation: { type: Schema.Types.ObjectId, ref: 'Automation', index: true },
		name: { type: String, trim: true },
		route: { type: String, trim: true },
		record: { type: Schema.Types.ObjectId },
		recordName: { type: String, trim: true },
		event: { type: String, trim: true },
		status: { type: String, enum: ['success', 'failed', 'skipped'], required: true },
		steps: { type: [{ _id: false, type: { type: String }, ok: Boolean, detail: String }], default: [] },
		error: { type: String, trim: true },
		/** 1 for a save by a person or the API; more when another automation's write started it. */
		depth: { type: Number, default: 1 },
		actorName: { type: String, trim: true },
	},
	{ timestamps: true, versionKey: false }
);

schema.index({ createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600, name: 'ttl_30d' });
schema.plugin(tenantScoped);

export default mongoose.model<any>('AutomationRun', schema, 'automationruns');
