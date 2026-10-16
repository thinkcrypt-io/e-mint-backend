import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A record's scheduled publish or take-off (docs/cms D7, CMS-11): one job per
 * record and action while it waits. The minute tick in
 * contentSchedule.function.ts claims the due ones, applies them and keeps them
 * as done or failed (with why) for a month. The records themselves carry
 * nothing: a project's records share one collection each, and the tick reads
 * this one alone. Scoped to the project; the super admin's drafts models have
 * jobs with no organization.
 */
export const SCHEDULE_ACTIONS = ['publish', 'unpublish'] as const;
export const SCHEDULE_STATES = ['pending', 'running', 'done', 'failed'] as const;

const schema = new Schema<any>(
	{
		/** The model's definition (its name and route can change; this can't). */
		modelDef: { type: Schema.Types.ObjectId, ref: 'ModelDefinition', required: true },
		/** The model's route when it was scheduled — for lists and links. */
		route: { type: String, required: true, trim: true },
		record: { type: Schema.Types.ObjectId, required: true },
		/** The record's name when it was scheduled, for lists and notifications. */
		name: { type: String, trim: true, default: '' },
		action: { type: String, enum: SCHEDULE_ACTIONS, required: true },
		at: { type: Date, required: true },
		/** Who set it: the publish is theirs, and they hear how it went. */
		by: { type: Schema.Types.ObjectId },
		byName: { type: String, trim: true, default: '' },
		state: { type: String, enum: SCHEDULE_STATES, default: 'pending' },
		claimedAt: { type: Date },
		tries: { type: Number, default: 0 },
		doneAt: { type: Date },
		error: { type: String, trim: true, default: '' },
	},
	{ timestamps: true, versionKey: false }
);

schema.plugin(tenantScoped);

// The tick: the due ones, oldest first.
schema.index({ state: 1, at: 1 });
// One waiting publish and one waiting take-off per record.
schema.index({ record: 1, action: 1 }, { unique: true, partialFilterExpression: { state: 'pending' } });
// Done and failed ones go after 30 days.
schema.index({ doneAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model<any>('ContentSchedule', schema, 'contentschedules');
