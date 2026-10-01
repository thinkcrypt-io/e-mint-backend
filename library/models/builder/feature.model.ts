import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A feature built in one go — several models, the fields added to existing
 * ones, and the tabs that link them — by the feature wizard or an AI client
 * over MCP (featureBuilder.function.ts). A record of what was asked and what
 * was built; the models themselves are ordinary ModelDefinitions.
 */
const schema = new Schema<any>(
	{
		title: { type: String, required: true, trim: true },
		description: { type: String, default: '' },
		summary: { type: String, default: '' },
		source: { type: String, enum: ['wizard', 'mcp'], default: 'wizard' },
		// The plan as it was built (normalized steps).
		plan: { type: Schema.Types.Mixed, default: null },
		result: { type: Schema.Types.Mixed, default: null },
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		apiKey: { type: Schema.Types.ObjectId, ref: 'ApiKey' },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

// Tenant documents carry organization/project; every query is confined to its scope (docs/multi-tenancy).
schema.plugin(tenantScoped);

export default mongoose.model<any>('BuiltFeature', schema, 'builtfeatures');
