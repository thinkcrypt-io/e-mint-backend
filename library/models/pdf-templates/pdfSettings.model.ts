import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * Business details, currency and date format every PDF template of a scope
 * reads (docs/pdf-templates D8) — one document, key 'default'. Checked by
 * normalizeSettings before it's saved.
 */
const schema = new Schema<any>(
	{
		key: { type: String, required: true, default: 'default' },
		data: { type: Schema.Types.Mixed, default: {} },
		updatedBy: { type: Schema.Types.ObjectId },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, key: 1 }, { unique: true });

export default mongoose.model<any>('PdfSettings', schema, 'pdfsettings');
