import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { BillingProfile } from './billingProfile.js';
import { amountToWords } from './numberToWords.js';
import type { BankAccount, InvoicePdfOptions } from './invoicePdf.js';
import {
	Fonts,
	formatClientAddress,
	formatDate,
	loadBrandMark,
	loadSignatureBuffer,
	money,
	registerFonts,
} from './invoicePdfAssets.js';

/**
 * Invoice/receipt PDF — design v2, "Editorial".
 *
 * A lighter, more spacious take on the same document: the dark masthead band of
 * v1 (lib/invoicePdf.ts) gives way to an oversized "BILL"/"RECEIPT" wordmark on
 * white with the brand lockup opposite it, every block is introduced by a ruled
 * section header so nothing has to be hunted for, the line items sit in a
 * zebra-striped table, and each page closes on a full-bleed brand band carrying
 * the web address and the page count.
 *
 * It carries exactly the same fields and options as v1 — nothing was added and
 * nothing dropped — so the two are interchangeable per download; see
 * lib/invoiceDesigns.ts for the registry the route picks from.
 */

const INK = '#111111';
const MUTED = '#6b6b6b';
const HAIRLINE = '#e2e2e2';
const RULE = '#111111';
const ZEBRA = '#f5f5f5';
const BAR = '#111111';
const ON_BAR = '#ffffff';
const ON_BAR_MUTED = '#a8a8a8';

/** The full-bleed brand band every page ends on. Content is kept clear of it. */
const FOOTER_BAND_H = 46;
/** Breathing room between the last line of content and the brand band. */
const FOOTER_CLEARANCE = 12;
/** Air between two top-level sections — the single knob for the page's rhythm. */
const SECTION_GAP = 18;
/** Air between blocks stacked inside one column, tighter than between sections. */
const BLOCK_GAP = 12;
/** Height a section header adds above its content — see sectionHeader. */
const SECTION_HEADER_H = 20;
/** One row of the totals stack, the air under it, and the bar that closes it. */
const TOTAL_ROW_H = 15;
const TOTALS_BAR_GAP = 6;
const TOTAL_BAR_H = 38;
/** One label/value row of the bank details block. */
const PAY_ROW_H = 13;
/** The receipt's amount-paid bar. */
const PAID_BAR_H = 54;
/** The signature: a well roomy enough to sign by hand, and the rule under it. */
const SIGN_WELL_H = 50;
const SIGN_IMAGE_W = 150;
const SIGN_RULE_W = 185;
/** The date line under the rule, plus the air below it. */
const SIGN_TAIL_H = 6;

/** The last y content may occupy before it would collide with the brand band. */
const contentBottom = (doc: PDFKit.PDFDocument): number => doc.page.height - FOOTER_BAND_H - FOOTER_CLEARANCE;

/** Starts a new page when `needed` points of content won't fit below `y`. */
const fitOrBreak = (doc: PDFKit.PDFDocument, y: number, needed: number): number => {
	if (y + needed <= contentBottom(doc)) return y;
	doc.addPage();
	return doc.page.margins.top;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

const hairline = (doc: PDFKit.PDFDocument, x1: number, x2: number, y: number, color = HAIRLINE, weight = 0.75) => {
	doc.moveTo(x1, y).lineTo(x2, y).lineWidth(weight).strokeColor(color).stroke();
};

/**
 * Opens a section: its name in bold small caps, then a hairline running out to
 * the end of the column.
 *
 *     BILL TO ──────────────────────────────
 *
 * Every block on the page gets one, so a reader can find what they came for —
 * who it is for, what is owed, how to pay — without reading the whole document.
 * Returns the y-coordinate the section's content starts at.
 */
const sectionHeader = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	label: string,
	x: number,
	width: number,
	y: number
): number => {
	const text = label.toUpperCase();
	doc.font(fonts.bold).fontSize(8).fillColor(INK).text(text, x, y, { characterSpacing: 1.4 });
	const textW = doc.widthOfString(text, { characterSpacing: 1.4 } as any);
	const ruleX = x + textW + 10;
	if (ruleX < x + width) hairline(doc, ruleX, x + width, y + 4);
	return y + SECTION_HEADER_H;
};

/** A pale, full-page watermark drawn behind everything else — the profile's
 *  watermark image when one is configured, otherwise the company name rendered
 *  huge and rotated. Must run before any foreground content is drawn on the
 *  page it applies to. */
const drawWatermark = (doc: PDFKit.PDFDocument, profile: BillingProfile, fonts: Fonts) => {
	const { width, height } = doc.page;
	const wmAbsPath = profile.watermarkPath ? path.resolve(process.cwd(), profile.watermarkPath) : null;
	const hasWatermarkImage = !!wmAbsPath && fs.existsSync(wmAbsPath);

	doc.save();
	doc.opacity(0.04);
	if (hasWatermarkImage) {
		const size = Math.min(width, height) * 0.55;
		try {
			doc.image(wmAbsPath as string, (width - size) / 2, (height - size) / 2 - 20, {
				width: size,
				height: size,
				fit: [size, size],
			});
		} catch {
			// A corrupt/unreadable watermark image must never break the download.
		}
	} else {
		doc.rotate(-35, { origin: [width / 2, height / 2] });
		doc.font(fonts.bold).fontSize(90).fillColor(INK)
			.text(profile.company.name.toUpperCase(), 0, height / 2 - 45, { width, align: 'center' });
	}
	doc.restore();
};

// ─────────────────────────────────────────────────────────────────────────────
// Page furniture
// ─────────────────────────────────────────────────────────────────────────────

/** The light masthead: an oversized document wordmark and reference on the
 *  left, the brand lockup with address and web address on the right, closed off
 *  by a rule. Returns the y-coordinate content starts at. */
const drawMasthead = (
	doc: PDFKit.PDFDocument,
	profile: BillingProfile,
	label: string,
	invoice: any,
	L: number,
	W: number,
	R: number,
	fonts: Fonts,
	markInk: Buffer | null,
	refCode?: string
): number => {
	const top = doc.page.margins.top;

	// ── Left: document wordmark, underscored, over its reference ────────────
	const wordmark = label.toUpperCase();
	doc.font(fonts.bold).fontSize(30).fillColor(INK).text(wordmark, L, top, { characterSpacing: 5 });
	const wordmarkW = doc.widthOfString(wordmark, { characterSpacing: 5 } as any);
	let leftBottom = top + 38;
	doc.moveTo(L, leftBottom).lineTo(L + Math.min(wordmarkW, W / 2), leftBottom).lineWidth(2.5).strokeColor(RULE).stroke();
	leftBottom += 10;
	if (refCode) {
		doc.font(fonts.medium).fontSize(9).fillColor(MUTED).text(`# ${refCode}`, L, leftBottom, { characterSpacing: 1 });
		leftBottom += 14;
	}

	// ── Right: brand lockup ─────────────────────────────────────────────────
	// `billFromOverride` replaces the whole sender identity when set — the same
	// override v1 honours, just moved into the masthead where this design puts
	// the sender.
	let rightY = top;

	if (invoice.billFromOverride) {
		doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED)
			.text(invoice.billFromOverride, L, rightY, { width: W, align: 'right' });
		rightY += doc.heightOfString(invoice.billFromOverride, { width: W, align: 'right' }) + 6;
	} else {
		// The mark sits directly over the wordmark, both flush to the right
		// margin, so the pair reads as one stacked lockup.
		const markSize = 32;
		if (markInk) {
			try {
				doc.image(markInk, R - markSize, rightY, { width: markSize, height: markSize, fit: [markSize, markSize] });
			} catch {
				// A corrupt/unreadable mark must never break the download.
			}
			rightY += markSize + 4;
		}

		doc.font(fonts.display).fontSize(22).fillColor(INK)
			.text(profile.company.name.toUpperCase(), L, rightY, { width: W, align: 'right', characterSpacing: 2.5 });
		rightY += 23;

		doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED);
		profile.company.addressLines?.forEach(line => {
			doc.text(line, L, rightY, { width: W, align: 'right' });
			rightY += 11;
		});

		if (profile.company.website) {
			rightY += 3;
			doc.font(fonts.bold).fontSize(8.5).fillColor(INK)
				.text(profile.company.website, L, rightY, { width: W, align: 'right' });
			rightY += 13;
		}
	}

	const bottom = Math.max(leftBottom, rightY) + 8;
	hairline(doc, L, R, bottom, RULE, 1);
	return bottom + SECTION_GAP;
};

/**
 * The full-bleed brand band that closes every page: the mark reversed out in
 * white beside the company name, the profile's thank-you note in the middle,
 * and the web address over the page count on the right.
 *
 * Drawn in a second pass over buffered pages, because "page 2 of 5" cannot be
 * known until the document is complete.
 */
const drawFooterBand = (
	doc: PDFKit.PDFDocument,
	profile: BillingProfile,
	fonts: Fonts,
	markWhite: Buffer | null,
	L: number,
	R: number,
	pageNumber: number,
	pageCount: number
) => {
	const bandY = doc.page.height - FOOTER_BAND_H;

	// The band sits below the bottom margin, and pdfkit paginates any text given
	// a `width` once it crosses that margin — which would silently push every
	// line of this band onto a new blank page. Dropping the margin for the
	// duration of the stamp keeps it where it was drawn.
	const bottomMargin = doc.page.margins.bottom;
	doc.page.margins.bottom = 0;

	doc.rect(0, bandY, doc.page.width, FOOTER_BAND_H).fill(BAR);

	// ── Left: mark + company name ───────────────────────────────────────────
	let x = L;
	if (markWhite) {
		try {
			doc.image(markWhite, x, bandY + FOOTER_BAND_H / 2 - 9, { width: 18, height: 18, fit: [18, 18] });
			x += 25;
		} catch {
			// A corrupt/unreadable mark must never break the download.
		}
	}
	doc.font(fonts.display).fontSize(13).fillColor(ON_BAR).text(profile.company.name.toUpperCase(), x, bandY + FOOTER_BAND_H / 2 - 7, {
		characterSpacing: 1.6,
		lineBreak: false,
	});

	// ── Right: web address over the page count ──────────────────────────────
	const rightW = 150;
	const rightX = R - rightW;
	if (profile.company.website) {
		doc.font(fonts.medium).fontSize(8).fillColor(ON_BAR)
			.text(profile.company.website, rightX, bandY + 12, { width: rightW, align: 'right', lineBreak: false });
	}
	doc.font(fonts.regular).fontSize(7).fillColor(ON_BAR_MUTED)
		.text(`Page ${pageNumber} of ${pageCount}`, rightX, bandY + 26, { width: rightW, align: 'right', lineBreak: false });

	// ── Middle: the thank-you note, centred in what is left ─────────────────
	const noteX = L + 160;
	const noteW = rightX - noteX - 20;
	if (profile.footerNote && noteW >= 80) {
		doc.font(fonts.regular).fontSize(6.5).fillColor(ON_BAR_MUTED);
		const noteH = doc.heightOfString(profile.footerNote, { width: noteW, align: 'center' });
		doc.text(profile.footerNote, noteX, bandY + (FOOTER_BAND_H - noteH) / 2, { width: noteW, align: 'center' });
	}

	doc.page.margins.bottom = bottomMargin;
};

// ─────────────────────────────────────────────────────────────────────────────
// Recipient + document facts
// ─────────────────────────────────────────────────────────────────────────────

/** Recipient block: name, address and contact details of whoever the document
 *  is addressed to. Returns the bottom y. */
const drawRecipient = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	invoice: any,
	L: number,
	maxWidth: number,
	y: number
): number => {
	const client = invoice.client || {};
	doc.font(fonts.bold).fontSize(13).fillColor(INK).text(client.name || invoice.name || '—', L, y, { width: maxWidth });
	let by = y + 20;

	const lines = [formatClientAddress(client), client.email, client.phone].filter(Boolean) as string[];
	doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED);
	lines.forEach(line => {
		doc.text(line, L, by, { width: maxWidth });
		by += doc.heightOfString(line, { width: maxWidth }) + 3;
	});

	return by;
};

/** The document facts opposite the recipient — account number, dates, status —
 *  as label/value rows separated by hairlines and bounded top and bottom by a
 *  rule. Returns the bottom y. */
const drawFactPanel = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	rows: [string, string][],
	x: number,
	width: number,
	y: number
): number => {
	const rowH = 18;
	hairline(doc, x, x + width, y, RULE, 1);

	let ry = y + 6;
	rows.forEach(([label, value], i) => {
		if (i > 0) hairline(doc, x, x + width, ry - 4);
		doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED).text(label, x, ry, { width: width * 0.5 });
		doc.font(fonts.bold).fontSize(8.5).fillColor(INK)
			.text(value, x + width * 0.5, ry, { width: width * 0.5, align: 'right' });
		ry += rowH;
	});

	ry -= 4;
	hairline(doc, x, x + width, ry, RULE, 1);
	return ry;
};

// ─────────────────────────────────────────────────────────────────────────────
// Line items
// ─────────────────────────────────────────────────────────────────────────────

type TableColumns = {
	xDesc: number;
	xPrice: number;
	xQty: number;
	xTotal: number;
	cDesc: number;
	cPrice: number;
	cQty: number;
	cTotal: number;
};

const tableColumns = (L: number, W: number): TableColumns => {
	const cPrice = 85;
	const cQty = 75;
	const cTotal = 95;
	const cDesc = W - cPrice - cQty - cTotal;
	return {
		xDesc: L,
		xPrice: L + cDesc,
		xQty: L + cDesc + cPrice,
		xTotal: L + cDesc + cPrice + cQty,
		cDesc,
		cPrice,
		cQty,
		cTotal,
	};
};

const PAD_X = 12;
const ROW_PAD_Y = 8;
const MIN_ROW_H = 30;
const MIN_ROWS = 4;

/** A zebra-striped line-items table: ITEM DESCRIPTION / PRICE / QUANTITY /
 *  TOTAL, the item name in bold with its description set quietly underneath,
 *  and alternating tint bands instead of rules between rows. Row heights grow
 *  with wrapped text, and the table pads out to MIN_ROWS so a short invoice
 *  still reads as a block. Returns the y-coordinate to continue from. */
const drawItemsTable = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	items: any[],
	L: number,
	W: number,
	R: number,
	y: number,
	/** Height of the block that follows the table. Once the real rows are drawn
	 *  the striped block is padded with blank rows to fill whatever the closing
	 *  block won't need — or the whole page, when the closing block is going
	 *  overleaf regardless. Either way the foot of the page doesn't trail off. */
	closingH?: number
): number => {
	const cols = tableColumns(L, W);
	const headerH = 24;

	const drawHeader = (top: number): number => {
		const labelY = top + 6;
		doc.font(fonts.bold).fontSize(7.5).fillColor(MUTED);
		doc.text('ITEM DESCRIPTION', cols.xDesc + PAD_X, labelY, { characterSpacing: 1 });
		doc.text('PRICE', cols.xPrice, labelY, { width: cols.cPrice, align: 'center', characterSpacing: 1 });
		doc.text('QUANTITY', cols.xQty, labelY, { width: cols.cQty, align: 'center', characterSpacing: 1 });
		doc.text('TOTAL', cols.xTotal, labelY, { width: cols.cTotal - PAD_X, align: 'right', characterSpacing: 1 });
		const bottom = top + headerH;
		hairline(doc, L, R, bottom, RULE, 1);
		return bottom;
	};

	/** Height a row needs for its (possibly wrapping) name and description. */
	const measureRow = (item: any): number => {
		if (!item) return MIN_ROW_H;
		const textW = cols.cDesc - PAD_X * 2;
		doc.font(fonts.bold).fontSize(9.5);
		let h = ROW_PAD_Y + doc.heightOfString(item.name || '', { width: textW });
		if (item.description) {
			doc.font(fonts.regular).fontSize(8);
			h += 3 + doc.heightOfString(item.description, { width: textW });
		}
		return Math.max(h + ROW_PAD_Y, MIN_ROW_H);
	};

	let cy = drawHeader(y);
	const rowCount = Math.max(items.length, MIN_ROWS);
	// Zebra banding follows the row's position on its own page, so a table that
	// breaks across pages restarts striping under the repeated header rather
	// than carrying a half-finished pattern over.
	let bandIndex = 0;

	for (let i = 0; i < rowCount; i++) {
		const item = items[i];
		const rowH = measureRow(item);

		if (cy + rowH > contentBottom(doc)) {
			doc.addPage();
			cy = drawHeader(doc.page.margins.top);
			bandIndex = 0;
		}

		if (bandIndex % 2 === 0) doc.rect(L, cy, W, rowH).fill(ZEBRA);

		if (item) {
			const textW = cols.cDesc - PAD_X * 2;
			const textY = cy + ROW_PAD_Y;
			doc.font(fonts.bold).fontSize(9.5).fillColor(INK)
				.text(item.name || `Item ${i + 1}`, cols.xDesc + PAD_X, textY, { width: textW });
			if (item.description) {
				doc.font(fonts.regular).fontSize(8).fillColor(MUTED)
					.text(item.description, cols.xDesc + PAD_X, doc.y + 3, { width: textW });
			}

			doc.font(fonts.regular).fontSize(9).fillColor(INK);
			doc.text(money(item.rate), cols.xPrice, textY, { width: cols.cPrice, align: 'center' });
			doc.text(String(item.quantity ?? 1), cols.xQty, textY, { width: cols.cQty, align: 'center' });
			doc.font(fonts.medium).text(money(item.total), cols.xTotal, textY, { width: cols.cTotal - PAD_X, align: 'right' });
		}

		cy += rowH;
		bandIndex += 1;
	}

	if (closingH) {
		// Room the closing block needs right here; if it doesn't fit it will start
		// a page of its own, and this page may as well be filled to the foot.
		const closingFits = cy + SECTION_GAP + closingH <= contentBottom(doc);
		const fillTo = closingFits ? contentBottom(doc) - SECTION_GAP - closingH : contentBottom(doc);

		while (cy + MIN_ROW_H <= fillTo) {
			if (bandIndex % 2 === 0) doc.rect(L, cy, W, MIN_ROW_H).fill(ZEBRA);
			cy += MIN_ROW_H;
			bandIndex += 1;
		}
	}

	hairline(doc, L, R, cy, RULE, 1);
	return cy;
};

/**
 * How tall the bill's closing block will be, measured before anything is drawn
 * so the items table above it knows how far it may stretch.
 *
 * It mirrors what the closing block actually draws — change one and the other
 * has to follow, which is why both read off the same layout constants.
 */
const measureClosingBlock = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	invoice: any,
	bank: BankAccount,
	options: InvoicePdfOptions,
	currency: string,
	leftW: number
): number => {
	const payRows = 5 + (bank?.routingNumber ? 1 : 0);
	let left = SECTION_HEADER_H + payRows * PAY_ROW_H;

	const words = invoice.amountInWords || amountToWords(invoice.total, currency);
	doc.font(fonts.medium).fontSize(9);
	left += BLOCK_GAP + SECTION_HEADER_H + doc.heightOfString(words, { width: leftW });

	if (invoice.note) {
		doc.font(fonts.regular).fontSize(8.5);
		left += BLOCK_GAP + SECTION_HEADER_H + doc.heightOfString(invoice.note, { width: leftW });
	}

	const totalRows = 1 + [invoice.tax, invoice.shipping, invoice.others].filter(v => Number(v) > 0).length;
	const right =
		SECTION_HEADER_H +
		totalRows * TOTAL_ROW_H +
		TOTALS_BAR_GAP +
		TOTAL_BAR_H +
		BLOCK_GAP +
		SECTION_HEADER_H +
		signatureHeight(invoice, options);

	return Math.max(left, right);
};

// ─────────────────────────────────────────────────────────────────────────────
// Summary, payment details, signature
// ─────────────────────────────────────────────────────────────────────────────

/** The totals stack — subtotal and any tax/shipping/others the invoice carries
 *  — closed by the solid grand-total bar. Returns the bottom y. */
const drawTotals = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	invoice: any,
	currency: string,
	x: number,
	width: number,
	y: number
): number => {
	const rows: [string, number][] = [['Sub Total', invoice.subTotal]];
	if (Number(invoice.tax) > 0) rows.push(['Tax', invoice.tax]);
	if (Number(invoice.shipping) > 0) rows.push(['Shipping', invoice.shipping]);
	if (Number(invoice.others) > 0) rows.push(['Others', invoice.others]);

	let ry = y;
	rows.forEach(([label, value]) => {
		doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED).text(label, x, ry, { width: width * 0.5 });
		doc.font(fonts.medium).fontSize(9).fillColor(INK)
			.text(`${currency} ${money(value)}`, x + width * 0.5, ry, { width: width * 0.5, align: 'right' });
		ry += TOTAL_ROW_H;
	});

	ry += TOTALS_BAR_GAP;
	const barH = TOTAL_BAR_H;
	doc.rect(x, ry, width, barH).fill(BAR);
	doc.font(fonts.medium).fontSize(8).fillColor(ON_BAR_MUTED)
		.text('GRAND TOTAL', x + 14, ry + barH / 2 - 4, { width: width * 0.5, characterSpacing: 1.2 });
	doc.font(fonts.bold).fontSize(12).fillColor(ON_BAR)
		.text(`${currency} ${money(invoice.total)}`, x + width * 0.5, ry + barH / 2 - 7, {
			width: width * 0.5 - 14,
			align: 'right',
		});

	return ry + barH;
};

/** Payment method and the bank account the money should go to. Returns the
 *  bottom y. */
const drawPaymentDetails = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	invoice: any,
	bank: BankAccount,
	x: number,
	width: number,
	y: number
): number => {
	const rows: [string, string][] = [
		['Method', invoice.paymentMethod || '—'],
		['Account Name', bank?.accountName || '—'],
		['Account No.', bank?.accountNumber || '—'],
		['Bank Name', bank?.bankName || '—'],
		['Branch', bank?.branch || '—'],
	];
	if (bank?.routingNumber) rows.push(['Routing No.', bank.routingNumber]);

	const labelW = Math.min(92, width * 0.42);
	let py = y;
	rows.forEach(([label, value]) => {
		doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED).text(label, x, py, { width: labelW });
		doc.font(fonts.medium).fontSize(8.5).fillColor(INK).text(value, x + labelW, py, { width: width - labelW });
		py += PAY_ROW_H;
	});

	return py;
};

/** The signature block: the signature image (when the admin asked for a signed
 *  copy and has one), a rule to sign over otherwise, then the signer's name and
 *  the date. Returns the bottom y. */
const drawSignature = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	invoice: any,
	options: InvoicePdfOptions,
	signatureBuffer: Buffer | null,
	x: number,
	width: number,
	y: number
): number => {
	let ay = y;

	if (signatureBuffer) {
		try {
			doc.image(signatureBuffer, x + width - SIGN_IMAGE_W, ay, {
				width: SIGN_IMAGE_W,
				height: SIGN_WELL_H - 4,
				fit: [SIGN_IMAGE_W, SIGN_WELL_H - 4],
			});
		} catch (err: any) {
			// A corrupt/unreadable signature buffer must never break the download,
			// but log it — this kind of failure is otherwise silent.
			console.error('Failed to embed signature image:', err?.message);
		}
	}
	ay += SIGN_WELL_H;

	hairline(doc, x + width - SIGN_RULE_W, x + width, ay, RULE, 0.9);
	ay += 8;

	const signatureName = signerName(invoice, options);
	if (signatureName) {
		doc.font(fonts.bold).fontSize(11).fillColor(INK).text(signatureName, x, ay, { width, align: 'right' });
		ay += 15;
	}
	doc.font(fonts.regular).fontSize(8).fillColor(MUTED)
		.text(`Date: ${formatDate(new Date())}`, x, ay, { width, align: 'right' });

	return ay + SIGN_TAIL_H;
};

/** Whose name goes under the signature rule — only on a copy the admin asked to
 *  have signed. */
const signerName = (invoice: any, options: InvoicePdfOptions): string | null =>
	options.signed ? invoice.authorizedBy || options.signerName || null : null;

/** The height drawSignature will occupy, so the block above it can be sized
 *  without drawing it first. */
const signatureHeight = (invoice: any, options: InvoicePdfOptions): number =>
	SIGN_WELL_H + 8 + (signerName(invoice, options) ? 15 : 0) + SIGN_TAIL_H;

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

type RenderContext = { doc: PDFKit.PDFDocument; fonts: Fonts; L: number; W: number; R: number };

/** The two-column rail the summary sections sit in — payment details on the
 *  left, money on the right. */
const RAIL_W = 230;
const RAIL_GAP = 28;

/**
 * Boilerplate every v2 document shares: document setup, brand fonts, the
 * watermark on every page, the closing brand band on every page, and buffering
 * the output. `render` draws the body against the page's usable box.
 */
const renderDocument = (
	profile: BillingProfile,
	markWhite: Buffer | null,
	render: (ctx: RenderContext) => void
): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		try {
			// bufferPages keeps every page open until the end, so the brand band can
			// be stamped on all of them once the page count is finally known.
			const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
			const fonts = registerFonts(doc);
			const chunks: Buffer[] = [];
			doc.on('data', (c: Buffer) => chunks.push(c));
			doc.on('end', () => resolve(Buffer.concat(chunks)));
			doc.on('error', reject);
			doc.on('pageAdded', () => drawWatermark(doc, profile, fonts));

			const L = doc.page.margins.left;
			const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
			const R = L + W;

			drawWatermark(doc, profile, fonts);
			render({ doc, fonts, L, W, R });

			const range = doc.bufferedPageRange();
			for (let i = 0; i < range.count; i++) {
				doc.switchToPage(range.start + i);
				drawFooterBand(doc, profile, fonts, markWhite, L, R, i + 1, range.count);
			}
			doc.flushPages();

			doc.end();
		} catch (error) {
			reject(error);
		}
	});

/** The recipient / document-facts row that opens both documents. Returns the
 *  y-coordinate to continue from. */
const drawHeaderRow = (
	ctx: RenderContext,
	invoice: any,
	recipientLabel: string,
	factsLabel: string,
	factRows: [string, string][],
	y: number
): number => {
	const { doc, fonts, L, R } = ctx;
	const panelX = R - RAIL_W;
	const recipientW = panelX - L - RAIL_GAP;

	const recipientTop = sectionHeader(doc, fonts, recipientLabel, L, recipientW, y);
	const factsTop = sectionHeader(doc, fonts, factsLabel, panelX, RAIL_W, y);

	const recipientBottom = drawRecipient(doc, fonts, invoice, L, recipientW, recipientTop);
	const factsBottom = drawFactPanel(doc, fonts, factRows, panelX, RAIL_W, factsTop);

	return Math.max(recipientBottom, factsBottom) + SECTION_GAP;
};

/**
 * Renders an agency bill (AdminInvoice) in design v2 — the same always-"BILL"-
 * labeled document as v1, with the same fields, in the lighter layout.
 */
export async function buildAdminInvoicePdfV2(
	invoice: any,
	profile: BillingProfile,
	options: InvoicePdfOptions = {}
): Promise<Buffer> {
	const signatureBuffer = options.signed ? await loadSignatureBuffer(options.signatureUrl) : null;
	// Two colourways of the same mark: ink for the white masthead, white for the
	// reversed brand band. pdfkit cannot recolour an image, so each is its own PNG.
	const [markInk, markWhite] = await Promise.all([loadBrandMark(profile, 'ink'), loadBrandMark(profile, 'white')]);
	const bank = options.bankAccount ?? null;

	return renderDocument(profile, markWhite, ctx => {
		const { doc, fonts, L, W, R } = ctx;
		const currency = invoice.currency || 'BDT';
		const railX = R - RAIL_W;
		const leftW = railX - L - RAIL_GAP;

		let y = drawMasthead(doc, profile, 'BILL', invoice, L, W, R, fonts, markInk, invoice.code);

		// ── Bill To / Invoice Details ───────────────────────────────────────
		const factRows: [string, string][] = [
			['Invoice Ref', invoice.code || '—'],
			['Invoice Date', formatDate(invoice.issueDate)],
		];
		if (invoice.dueDate) factRows.push(['Due Date', formatDate(invoice.dueDate)]);
		factRows.push(['Status', (invoice.status || '—').toUpperCase()]);

		y = drawHeaderRow(ctx, invoice, 'Bill To', 'Invoice Details', factRows, y);

		// ── Line items ──────────────────────────────────────────────────────
		// Measuring the closing block first lets the striped block stretch into
		// whatever is left, so the page fills instead of trailing off.
		const closingH = measureClosingBlock(doc, fonts, invoice, bank, options, currency, leftW);

		y = fitOrBreak(doc, y, 120);
		y = sectionHeader(doc, fonts, 'Line Items', L, W, y);
		y = drawItemsTable(doc, fonts, invoice.items || [], L, W, R, y, closingH) + SECTION_GAP;

		// ── Closing block ───────────────────────────────────────────────────
		// How to pay on the left, what is owed on the right. Kept as one run so
		// the two columns can never be split across a page break from each other
		// — an invoice whose total sits on a different page to its bank details
		// is worse than one that simply starts the whole block overleaf. The
		// measured height is what decides, so nothing can run under the band.
		y = fitOrBreak(doc, y, closingH);

		// Left: how to pay, what the figure says in words, anything else noted.
		let ly = sectionHeader(doc, fonts, 'Payment Details', L, leftW, y);
		ly = drawPaymentDetails(doc, fonts, invoice, bank, L, leftW, ly);

		ly = sectionHeader(doc, fonts, 'Amount in Words', L, leftW, ly + BLOCK_GAP);
		const amountWords = invoice.amountInWords || amountToWords(invoice.total, currency);
		doc.font(fonts.medium).fontSize(9).fillColor(INK).text(amountWords, L, ly, { width: leftW });
		ly += doc.heightOfString(amountWords, { width: leftW });

		if (invoice.note) {
			ly = sectionHeader(doc, fonts, 'Note', L, leftW, ly + BLOCK_GAP);
			doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED).text(invoice.note, L, ly, { width: leftW });
		}

		// Right: the money, then who signed for it.
		let ry = sectionHeader(doc, fonts, 'Summary', railX, RAIL_W, y);
		ry = drawTotals(doc, fonts, invoice, currency, railX, RAIL_W, ry);

		ry = sectionHeader(doc, fonts, 'Authorized Signature', railX, RAIL_W, ry + BLOCK_GAP);
		drawSignature(doc, fonts, invoice, options, signatureBuffer, railX, RAIL_W, ry);
	});
}

/**
 * A deliberately shorter, "RECEIPT"-labeled document in design v2 — only
 * offered for already-paid invoices. Same itemized table and payment details as
 * the bill, then a compact "amount paid" confirmation instead of a second full
 * summary.
 */
export async function buildAdminReceiptPdfV2(
	invoice: any,
	profile: BillingProfile,
	options: InvoicePdfOptions = {}
): Promise<Buffer> {
	const signatureBuffer = options.signed ? await loadSignatureBuffer(options.signatureUrl) : null;
	const [markInk, markWhite] = await Promise.all([loadBrandMark(profile, 'ink'), loadBrandMark(profile, 'white')]);

	return renderDocument(profile, markWhite, ctx => {
		const { doc, fonts, L, W, R } = ctx;
		const currency = invoice.currency || 'BDT';
		const railX = R - RAIL_W;

		let y = drawMasthead(doc, profile, 'RECEIPT', invoice, L, W, R, fonts, markInk, invoice.code);

		// ── Billed To / Receipt Details ─────────────────────────────────────
		const factRows: [string, string][] = [
			['Invoice Ref', invoice.code || '—'],
			['Date Paid', formatDate(new Date())],
		];

		y = drawHeaderRow(ctx, invoice, 'Billed To', 'Receipt Details', factRows, y);

		// ── Line items ──────────────────────────────────────────────────────
		// The receipt closes on the amount-paid bar and a signature — no bank
		// details, since nothing is left to pay. Both are measured up front so
		// the striped block can stretch into the space they leave.
		const closingH =
			SECTION_HEADER_H + PAID_BAR_H + SECTION_GAP + SECTION_HEADER_H + signatureHeight(invoice, options);

		y = fitOrBreak(doc, y, 120);
		y = sectionHeader(doc, fonts, 'Line Items', L, W, y);
		y = drawItemsTable(doc, fonts, invoice.items || [], L, W, R, y, closingH) + SECTION_GAP;

		// ── Amount paid confirmation ────────────────────────────────────────
		y = fitOrBreak(doc, y, closingH);
		y = sectionHeader(doc, fonts, 'Payment Received', L, W, y);

		const barH = PAID_BAR_H;
		doc.rect(L, y, W, barH).fill(BAR);
		doc.font(fonts.medium).fontSize(7.5).fillColor(ON_BAR_MUTED)
			.text('AMOUNT PAID', L + 16, y + 13, { width: W / 2 - 16, characterSpacing: 1.4 });
		doc.font(fonts.bold).fontSize(17).fillColor(ON_BAR)
			.text(`${currency} ${money(invoice.total)}`, L + 16, y + 26, { width: W / 2 - 16 });
		doc.font(fonts.medium).fontSize(7.5).fillColor(ON_BAR_MUTED)
			.text('PAYMENT METHOD', L + W / 2, y + 13, { width: W / 2 - 16, align: 'right', characterSpacing: 1.4 });
		doc.font(fonts.bold).fontSize(11).fillColor(ON_BAR)
			.text(invoice.paymentMethod || '—', L + W / 2, y + 29, { width: W / 2 - 16, align: 'right' });
		y += barH + SECTION_GAP;

		// ── Authorized Signature ────────────────────────────────────────────
		const signTop = sectionHeader(doc, fonts, 'Authorized Signature', railX, RAIL_W, y);
		drawSignature(doc, fonts, invoice, options, signatureBuffer, railX, RAIL_W, signTop);
	});
}

export default buildAdminInvoicePdfV2;
