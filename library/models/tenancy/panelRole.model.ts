import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A role for a project's panel users (docs/panel-users PU-01): what a login of
 * the panel app (panel.tcrypt.site) may do in its one project. Made by the
 * project's managers in the tenant panel, or by a panel super admin.
 *
 * `permissions` are per-model keys — view-/create-/edit-/delete-/publish-<route>,
 * the media library (`…-image`) and History (`view-history`), like a project's
 * own roles (WO-50) — plus `reports:view` and `reports:export`. Never `build`,
 * never anything of the project's settings or the organization: panel users are
 * not developers. Scoped to the project.
 */
const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 60 },
		description: { type: String, trim: true, maxlength: 300 },
		permissions: { type: [String], default: [] },
		createdBy: { type: Schema.Types.ObjectId },
	},
	{ timestamps: true, versionKey: false }
);

schema.plugin(tenantScoped);

export default mongoose.model<any>('PanelRole', schema, 'panelroles');
