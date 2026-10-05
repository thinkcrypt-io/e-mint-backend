import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A project's site widgets (docs/widgets W-03) — one document per project:
 * which widgets are switched on, each one's options and texts, and the look
 * they share. Read by `mint.js` on the tenant's own site (GET
 * /public/api/:slug/widgets), edited in the panel's Site setup → Widgets, by
 * the MCP and by templates. What each widget accepts is in
 * functions/widgets.function.ts (`WIDGET_TYPES`); anything else is dropped on
 * save.
 */
const schema = new Schema<any>(
	{
		/** { [widget]: { enabled, options: {…}, texts: {…} } } */
		widgets: { type: Schema.Types.Mixed, default: {} },
		theme: {
			/** Buttons and links; empty: the site's own primary colour (website projects), else near-black. */
			primaryColor: { type: String, trim: true, default: '' },
			/** Empty: the site's own font (inherited). */
			fontFamily: { type: String, trim: true, default: '' },
			/** Corner radius in pixels. */
			radius: { type: Number, min: 0, max: 24, default: 10 },
			/** auto follows the visitor's light or dark setting. */
			colorMode: { type: String, enum: ['auto', 'light', 'dark'], default: 'auto' },
		},
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1 }, { unique: true });

export default mongoose.model<any>('SiteWidgets', schema, 'sitewidgets');
