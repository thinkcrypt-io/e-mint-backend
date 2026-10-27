import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * An e-commerce project's store (docs/ecommerce EC2): the setup wizard's
 * answers — one doc per project, fixed shape, checked by
 * functions/commerce/settings.ts — and what the installer built from them
 * (`installed`: each pre-built model by its key, EC3). `status` moves
 * new → building → ready (or failed, with why); the panel opens the wizard
 * until it's ready.
 */
const schema = new Schema<any>(
	{
		status: { type: String, enum: ['new', 'building', 'ready', 'failed'], default: 'new' },
		/** The furthest wizard step reached, so leaving and coming back resumes there. */
		step: { type: String, trim: true, default: 'store' },
		answers: { type: Schema.Types.Mixed, default: {} },
		/** key → { name, route, id } of each model the installer built (outlet, product, order…). */
		installed: { type: Schema.Types.Mixed, default: {} },
		/** The features built so far (variations, coupons, shifts…), so a change builds only what's new. */
		features: { type: [String], default: [] },
		startedAt: Date,
		finishedAt: Date,
		error: String,
		problems: { type: [String], default: undefined },
	},
	{ timestamps: true, minimize: false }
);
schema.plugin(tenantScoped);

export default mongoose.model<any>('CommerceSettings', schema, 'commercesettings');
