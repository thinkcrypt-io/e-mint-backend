import { BillingProfile } from './billingProfile.js';
import type { InvoicePdfOptions } from './invoicePdf.js';
import { buildAdminInvoicePdf, buildAdminReceiptPdf } from './invoicePdf.js';
import { buildAdminInvoicePdfV2, buildAdminReceiptPdfV2 } from './invoicePdfV2.js';

/**
 * The invoice PDF designs an admin can pick between at download time.
 *
 * Every design renders the same document from the same AdminInvoice fields and
 * the same InvoicePdfOptions — they differ only in layout, so switching design
 * never changes what information the PDF carries. Adding a design means adding
 * a renderer module and one entry here; nothing downstream needs to know the
 * list.
 */

export type InvoiceDocumentType = 'bill' | 'receipt';

export type InvoicePdfBuilder = (
	invoice: any,
	profile: BillingProfile,
	options?: InvoicePdfOptions
) => Promise<Buffer>;

export type InvoiceDesign = {
	id: string;
	label: string;
	description: string;
	bill: InvoicePdfBuilder;
	receipt: InvoicePdfBuilder;
};

export const INVOICE_DESIGNS: InvoiceDesign[] = [
	{
		id: 'v1',
		label: 'Classic',
		description: 'Dark masthead band with a border-free, hairline-ruled items table.',
		bill: buildAdminInvoicePdf,
		receipt: buildAdminReceiptPdf,
	},
	{
		id: 'v2',
		label: 'Editorial',
		description:
			'Light masthead with an oversized wordmark, ruled section headers, zebra-striped items, a solid grand-total bar and a brand footer band on every page.',
		bill: buildAdminInvoicePdfV2,
		receipt: buildAdminReceiptPdfV2,
	},
];

/** The design used when a download doesn't ask for one — the design that was
 *  in production before designs became switchable, so existing links, saved
 *  bookmarks and the email templates keep producing the PDF they always did. */
export const DEFAULT_INVOICE_DESIGN = 'v1';

/** Resolves a design id (typically straight off the query string) to its
 *  renderers, falling back to the default rather than erroring — an unknown or
 *  missing id should still hand the admin a usable PDF. */
export const resolveInvoiceDesign = (id?: string): InvoiceDesign =>
	INVOICE_DESIGNS.find(d => d.id === id) ??
	(INVOICE_DESIGNS.find(d => d.id === DEFAULT_INVOICE_DESIGN) as InvoiceDesign);

/** Picks the builder for one design + document type. */
export const resolveInvoicePdfBuilder = (id: string | undefined, type: InvoiceDocumentType): InvoicePdfBuilder =>
	resolveInvoiceDesign(id)[type];

export default INVOICE_DESIGNS;
