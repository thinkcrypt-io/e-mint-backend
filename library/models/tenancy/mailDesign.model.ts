import mongoose, { Schema } from 'mongoose';

/**
 * How a project's emails look (docs/messaging M-03a): the frame every email it
 * sends is put in — automation emails, receipts, welcomes, tests. Either
 * **plain** (just the text, like a person wrote it, with a signature) or
 * **designed** (a header with the logo or name, colours, a card, a footer).
 * Edited as a form with a live preview — not placed freely like the PDF
 * designer. A project can have several; one is its default, and an automation's
 * email can pick another. Without one, MINT's classic look (mailPage). Checked
 * and rendered by functions/mailDesign.function.ts. One shared collection (MD10).
 */
const color = { type: String, trim: true, maxlength: 7 };

const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
		project: { type: Schema.Types.ObjectId, ref: 'TenantProject', required: true },
		name: { type: String, trim: true, required: true, maxlength: 80 },
		style: { type: String, enum: ['plain', 'designed'], default: 'designed' },
		isDefault: { type: Boolean, default: false },
		font: { type: String, default: 'sans' },
		/** The card's width in pixels (designed). */
		width: { type: Number, default: 560 },
		header: {
			show: { type: Boolean, default: true },
			/** An image address — the business logo by default. Empty: the title only. */
			logo: { type: String, trim: true, maxlength: 1000, default: '' },
			logoHeight: { type: Number, default: 40 },
			/** Text beside or instead of the logo; takes {{business.name}} and the like. */
			title: { type: String, trim: true, maxlength: 160, default: '{{business.name}}' },
			align: { type: String, enum: ['left', 'center'], default: 'left' },
			background: color,
			color,
		},
		colors: { page: color, card: color, text: color, heading: color, button: color, buttonText: color },
		/** Corner rounding of the card and buttons, in pixels. */
		radius: { type: Number, default: 12 },
		footer: {
			/** Lines under the email — a signature on a plain one. Takes {{business.*}}, {{project}}, {{year}}. */
			text: { type: String, trim: true, maxlength: 2000, default: '' },
			align: { type: String, enum: ['left', 'center'], default: 'center' },
		},
		createdBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
	},
	{ timestamps: true }
);

schema.index({ project: 1, createdAt: 1 });

export default mongoose.model<any>('MailDesign', schema, 'maildesigns');
