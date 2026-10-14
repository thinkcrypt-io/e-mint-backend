import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A component (docs/cms D3): a named group of fields made once and used by
 * any model — a Button (label, link, style), an SEO block, a Card, a Hero.
 * A model's field of kind `component` names one by `uid`, once or as a
 * repeatable list; when models compile, it becomes a section (or section list)
 * of these fields (dynamicModels expandComponents), so records, forms and the
 * API treat it like one. Changing a component recompiles every model using it.
 * Scoped to the project like the models (tenantScoped); the platform's own have
 * no scope.
 */
const schema = new Schema<any>(
	{
		/** `category.name`, e.g. `shared.button`, `content.hero` — how fields name it. Fixed once made. */
		uid: { type: String, required: true, trim: true, lowercase: true },
		category: { type: String, required: true, trim: true, lowercase: true },
		name: { type: String, required: true, trim: true, lowercase: true },
		title: { type: String, required: true, trim: true },
		description: { type: String, trim: true },
		/** A Lucide icon name for the pickers. */
		icon: { type: String, trim: true },
		/** Its fields, shaped like a model's (COMPONENT_KINDS only). */
		fields: { type: [Schema.Types.Mixed], default: [] },
		version: { type: Number, default: 1 },
		createdBy: { type: Schema.Types.ObjectId },
		updatedBy: { type: Schema.Types.ObjectId },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, uid: 1 }, { unique: true });

export default mongoose.model<any>('ComponentDefinition', schema, 'componentdefinitions');
