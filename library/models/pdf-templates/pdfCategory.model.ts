import mongoose, { Schema } from 'mongoose';

/**
 * A gallery category (docs/pdf-templates D21): Invoices, Receipts,
 * Quotations… One global list — not per project — kept by the super admin
 * (PDF templates → Gallery → Categories, or the builder MCP). A template's
 * `kind` is a category's `key`.
 */
const schema = new Schema<any>(
	{
		key: { type: String, required: true, unique: true, trim: true },
		name: { type: String, required: true, trim: true },
		description: { type: String, default: '' },
		order: { type: Number, default: 0 },
	},
	{ timestamps: true, versionKey: false }
);

export default mongoose.model<any>('PdfCategory', schema, 'pdfcategories');
