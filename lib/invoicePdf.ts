import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { BillingProfile } from './billingProfile.js';
import { amountToWords } from './numberToWords.js';

const INK = '#111111';
const MUTED = '#6b6b6b';
const BORDER = '#111111';
// A strictly black/white/gray palette — no accent color — plus the dark
// masthead band, its white-on-black text, and the hairline row dividers used
// by the modern (border-free) tables.
const HAIRLINE = '#e3e3e3';
const PANEL = '#f5f5f5';
const BAND = '#0d0d0d';
const ON_BAND = '#ffffff';
const ON_BAND_MUTED = '#c7c7c7';

const formatDate = (value: any): string => {
	const d = value ? new Date(value) : new Date();
	const dd = String(d.getDate()).padStart(2, '0');
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	return `${dd}/${mm}/${d.getFullYear()}`;
};

const money = (value: any): string => {
	const amount = Number(value || 0);
	return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export type BankAccount = {
	accountName?: string;
	accountNumber?: string;
	bankName?: string;
	branch?: string;
	routingNumber?: string;
} | null;

export type InvoicePdfOptions = {
	/** Embed the signer's signature image, if they have one configured — an
	 *  ephemeral, per-download choice, not stored on the invoice. */
	signed?: boolean;
	bankAccount?: BankAccount;
	/** The downloading admin's own name/signature (set via their Settings
	 *  screen — see Admin.signature) — never a shared org-wide signature. */
	signerName?: string;
	signatureUrl?: string;
};

type Fonts = { regular: string; medium: string; bold: string };

// Suisse Int'l is the agency's own brand typeface (already used on the
// public site) — a clean, modern grotesk, much sleeker than the Helvetica
// pdfkit falls back to when no font is registered. Registered fresh per
// PDFDocument (pdfkit fonts aren't shared across documents); falls back to
// Helvetica if the font files aren't present in this deployment so a missing
// asset can never break a PDF download.
const FONT_DIR = path.resolve(process.cwd(), 'public/fonts/suisse');
const FONT_FILES: [keyof Fonts, string][] = [
	['regular', 'SuisseIntl-Regular.otf'],
	['medium', 'SuisseIntl-Medium.otf'],
	['bold', 'SuisseIntl-Bold.otf'],
];

const registerFonts = (doc: PDFKit.PDFDocument): Fonts => {
	const fallback: Fonts = { regular: 'Helvetica', medium: 'Helvetica-Bold', bold: 'Helvetica-Bold' };
	try {
		const names = {} as Fonts;
		for (const [key, file] of FONT_FILES) {
			const abs = path.join(FONT_DIR, file);
			if (!fs.existsSync(abs)) return fallback;
			const fontName = `Suisse-${key}`;
			doc.registerFont(fontName, abs);
			names[key] = fontName;
		}
		return names;
	} catch (err: any) {
		console.error('Failed to register brand font, falling back to Helvetica:', err?.message);
		return fallback;
	}
};

/** Fetches the signer's signature image and normalizes it to PNG so pdfkit
 *  can embed it — the image is user-uploaded through the generic media
 *  picker, which stores everything as webp (smaller in the library), and
 *  pdfkit's doc.image() only decodes JPEG/PNG. Returns null (never throws)
 *  so a broken/unreachable/undecodable image never breaks the PDF. */
const loadSignatureBuffer = async (url?: string): Promise<Buffer | null> => {
	if (!url) return null;
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const raw = Buffer.from(await res.arrayBuffer());
		return await sharp(raw).png().toBuffer();
	} catch (err: any) {
		console.error('Failed to load signature image:', err?.message);
		return null;
	}
};

/** Loads the masthead logo off disk and normalizes it to PNG so pdfkit can
 *  embed it — the logo lockup is an SVG (renders near-white, meant for the
 *  dark band), and pdfkit's doc.image() can't decode SVG directly, so it's
 *  rasterized through sharp first. Returns null (never throws) so a missing/
 *  corrupt/unreadable logo file never breaks the PDF. */
const loadLogoBuffer = async (profile: BillingProfile): Promise<Buffer | null> => {
	if (!profile.logoPath) return null;
	const absPath = path.resolve(process.cwd(), profile.logoPath);
	if (!fs.existsSync(absPath)) return null;
	try {
		const raw = fs.readFileSync(absPath);
		if (absPath.toLowerCase().endsWith('.svg')) {
			return await sharp(raw, { density: 300 }).png().toBuffer();
		}
		return raw;
	} catch (err: any) {
		console.error('Failed to load logo image:', err?.message);
		return null;
	}
};

/** Client street/city/country live in three separate fields — joins whichever
 *  of them are set into one display line instead of only ever showing the
 *  street (`address`), which is often blank when city/country are the only
 *  thing on file. */
const formatClientAddress = (client: any): string =>
	[client?.address, client?.city, client?.country].filter(Boolean).join(', ');

/** A small uppercase, letter-spaced eyebrow label — "BILL TO", "BANK
 *  DETAILS", etc. — the modern stand-in for the old underlined headings. */
const sectionLabel = (doc: PDFKit.PDFDocument, fonts: Fonts, text: string, x: number, y: number, width?: number) => {
	doc.font(fonts.medium).fontSize(8).fillColor(MUTED)
		.text(text.toUpperCase(), x, y, { characterSpacing: 1, width });
};

/** A full-bleed dark band across the top of the page — the masthead — with
 *  the company wordmark and document label reversed out in white. Returns
 *  the y-coordinate to continue drawing from. */
const drawMasthead = (
	doc: PDFKit.PDFDocument,
	profile: BillingProfile,
	label: string,
	L: number,
	W: number,
	R: number,
	fonts: Fonts,
	logoBuffer: Buffer | null,
	refCode?: string
): number => {
	const bandH = 78;
	doc.rect(0, 0, doc.page.width, bandH).fill(BAND);

	const textX = logoBuffer ? L + 40 : L;

	if (logoBuffer) {
		try {
			doc.image(logoBuffer, L, bandH / 2 - 15, { width: 30, height: 30, fit: [30, 30] });
		} catch {
			// A corrupt/unreadable logo file must never break the download.
		}
	}

	doc.font(fonts.bold).fontSize(15).fillColor(ON_BAND)
		.text(profile.company.name.toUpperCase(), textX, bandH / 2 - 6, { characterSpacing: 2 });

	doc.font(fonts.bold).fontSize(18).fillColor(ON_BAND)
		.text(label.toUpperCase(), L, bandH / 2 - 15, { width: W, align: 'right', characterSpacing: 3 });
	if (refCode) {
		doc.font(fonts.regular).fontSize(8).fillColor(ON_BAND_MUTED)
			.text(`No. ${refCode}`, L, bandH / 2 + 6, { width: W, align: 'right' });
	}

	return bandH + 20;
};

/** A pale, full-page watermark drawn behind everything else — the profile's
 *  watermark image when one is configured, otherwise the company name
 *  rendered huge and rotated. Must run before any foreground content is
 *  drawn on the page it applies to. */
const drawWatermark = (doc: PDFKit.PDFDocument, profile: BillingProfile, fonts: Fonts) => {
	const { width, height } = doc.page;
	const wmAbsPath = profile.watermarkPath ? path.resolve(process.cwd(), profile.watermarkPath) : null;
	const hasWatermarkImage = !!wmAbsPath && fs.existsSync(wmAbsPath);

	doc.save();
	doc.opacity(0.05);
	if (hasWatermarkImage) {
		const size = Math.min(width, height) * 0.6;
		try {
			doc.image(wmAbsPath as string, (width - size) / 2, (height - size) / 2, {
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

/** Bill To block: client name + address (when the client is populated and
 *  has one). Returns the y-coordinate to continue from. */
const drawBillTo = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	invoice: any,
	label: string,
	L: number,
	maxWidth: number,
	y: number
): number => {
	const client = invoice.client || {};
	sectionLabel(doc, fonts, label, L, y);
	doc.font(fonts.bold).fontSize(11).fillColor(INK).text(client.name || invoice.name || '—', L, y + 13, { width: maxWidth });
	let by = y + 29;
	const address = formatClientAddress(client);
	if (address) {
		doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text(address, L, by, { width: maxWidth });
		by += doc.heightOfString(address, { width: maxWidth }) + 2;
	}
	return by;
};

/** A plain, borderless label/value column — the modern stand-in for the old
 *  boxed info grid (Date/REF/Status and the like). Returns the bottom y. */
const drawInfoRows = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	rows: [string, string][],
	x: number,
	width: number,
	y: number
): number => {
	let ry = y;
	rows.forEach(([label, value]) => {
		doc.font(fonts.medium).fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, ry, { characterSpacing: 0.5 });
		doc.font(fonts.bold).fontSize(9).fillColor(INK).text(value, x, ry, { width, align: 'right' });
		ry += 16;
	});
	return ry;
};

type TableColumns = { xDesc: number; xQty: number; xUnit: number; xAmount: number; cDesc: number; cQty: number; cUnit: number; cAmount: number };

const tableColumns = (L: number, W: number): TableColumns => {
	const cQty = 46;
	const cUnit = 95;
	const cAmount = 100;
	const cDesc = W - cQty - cUnit - cAmount;
	return { xDesc: L, xQty: L + cDesc, xUnit: L + cDesc + cQty, xAmount: L + cDesc + cQty + cUnit, cDesc, cQty, cUnit, cAmount };
};

/** A modern, border-free line-items table: a pale header band, hairline row
 *  dividers instead of a full grid, and a bold total row under a solid rule
 *  — the Stripe/AWS-receipt look the human asked for, shared by the bill and
 *  the receipt. Returns the y-coordinate to continue from. */
const drawItemsTable = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	items: any[],
	L: number,
	W: number,
	R: number,
	currency: string,
	total: number,
	y: number
): number => {
	const cols = tableColumns(L, W);
	const headerH = 22;
	// Row text is drawn ROW_PAD_TOP below the row's top edge; ROW_PAD_BOTTOM is
	// what's left under a single line in the old fixed 20pt row, so a one-line
	// row still measures exactly MIN_ROW_H and the table looks unchanged.
	const ROW_PAD_TOP = 6;
	const ROW_PAD_BOTTOM = 4;
	const MIN_ROW_H = 20;
	const MIN_ROWS = 4;
	const textW = cols.cDesc - 16;

	/** The one description string a row prints — built once so the measured
	 *  height and the drawn text can never disagree. */
	const itemLine = (item: any, i: number): string =>
		item.description ? `${item.name} — ${item.description}` : item.name || `Item ${i + 1}`;

	/** Height a row needs for its (possibly wrapping) description — measured
	 *  with the same font/size/width it is drawn with, so a long item grows its
	 *  row instead of spilling into the one beneath it. */
	const measureRow = (item: any, i: number): number => {
		if (!item) return MIN_ROW_H;
		doc.font(fonts.regular).fontSize(8.5);
		const h = ROW_PAD_TOP + doc.heightOfString(itemLine(item, i), { width: textW }) + ROW_PAD_BOTTOM;
		return Math.max(h, MIN_ROW_H);
	};

	const drawHeader = (top: number): number => {
		doc.rect(L, top, W, headerH).fill(PANEL);
		const labelY = top + headerH / 2 - 4;
		doc.font(fonts.bold).fontSize(7.5).fillColor(INK);
		doc.text('DESCRIPTION', cols.xDesc + 8, labelY, { characterSpacing: 0.5 });
		doc.text('QTY', cols.xQty, labelY, { width: cols.cQty, align: 'center', characterSpacing: 0.5 });
		doc.text('UNIT PRICE', cols.xUnit, labelY, { width: cols.cUnit - 8, align: 'right', characterSpacing: 0.5 });
		doc.text('AMOUNT', cols.xAmount, labelY, { width: cols.cAmount - 8, align: 'right', characterSpacing: 0.5 });
		return top + headerH;
	};

	let cy = drawHeader(y);
	const rowCount = Math.max(items.length, MIN_ROWS);

	for (let i = 0; i < rowCount; i++) {
		const item = items[i];
		const rowH = measureRow(item, i);

		if (cy + rowH > doc.page.height - 220) {
			doc.addPage();
			cy = drawHeader(doc.page.margins.top);
		}

		if (item) {
			const textY = cy + ROW_PAD_TOP;
			doc.font(fonts.regular).fontSize(8.5).fillColor(INK);
			doc.text(itemLine(item, i), cols.xDesc + 8, textY, { width: textW });
			doc.text(String(item.quantity ?? 1), cols.xQty, textY, { width: cols.cQty, align: 'center' });
			doc.text(money(item.rate), cols.xUnit, textY, { width: cols.cUnit - 8, align: 'right' });
			doc.font(fonts.medium).text(money(item.total), cols.xAmount, textY, { width: cols.cAmount - 8, align: 'right' });
		}

		doc.moveTo(L, cy + rowH).lineTo(R, cy + rowH).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
		cy += rowH;
	}

	if (cy + 40 > doc.page.height - 220) {
		doc.addPage();
		cy = doc.page.margins.top;
	}

	doc.moveTo(L, cy).lineTo(R, cy).lineWidth(1).strokeColor(INK).stroke();
	cy += 10;
	doc.font(fonts.bold).fontSize(9.5).fillColor(INK).text('TOTAL', cols.xDesc + 8, cy);
	doc.text(`${currency} ${money(total)}`, cols.xAmount, cy, { width: cols.cAmount - 8, align: 'right' });
	return cy + 22;
};

/** The Bank Details (left) + Authorized By (right) block shared by the bill
 *  and the receipt — plain label/value rows instead of a bordered grid, and
 *  the signature/name/date column pinned to the right margin. Returns the
 *  y-coordinate to continue from. */
const drawBankAndAuthorized = (
	doc: PDFKit.PDFDocument,
	fonts: Fonts,
	invoice: any,
	options: InvoicePdfOptions,
	bank: BankAccount,
	signatureBuffer: Buffer | null,
	L: number,
	R: number,
	y: number
): number => {
	const bankRows: [string, string][] = [
		['Account Name', bank?.accountName || '—'],
		['Account No.', bank?.accountNumber || '—'],
		['Bank Name', bank?.bankName || '—'],
		['Branch', bank?.branch || '—'],
	];
	if (bank?.routingNumber) bankRows.push(['Routing No.', bank.routingNumber]);

	const bankColW = 220;
	// A fixed-width column pinned to the right margin, not just offset from
	// the bank details — it should read as right-aligned on the page.
	const authBlockW = 160;
	const authX = R - authBlockW;
	const rowH = 18;

	sectionLabel(doc, fonts, 'Bank Details', L, y);
	sectionLabel(doc, fonts, 'Authorized By', authX, y, authBlockW);

	let by = y + 16;
	bankRows.forEach(([label, value]) => {
		doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED).text(label, L, by, { width: bankColW / 2 });
		doc.font(fonts.medium).fontSize(8.5).fillColor(INK).text(value, L + bankColW / 2, by, { width: bankColW / 2 });
		by += rowH;
	});

	let ay = y + 16;
	if (signatureBuffer) {
		try {
			doc.image(signatureBuffer, authX, ay, { width: 100, height: 40, fit: [100, 40] });
		} catch (err: any) {
			// A corrupt/unreadable signature buffer must never break the
			// download, but log it — this kind of failure is otherwise silent.
			console.error('Failed to embed signature image:', err?.message);
		}
	}
	ay += 46;
	doc.moveTo(authX, ay).lineTo(authX + authBlockW, ay).lineWidth(0.75).strokeColor(BORDER).stroke();
	ay += 9;

	if (options.signed) {
		const signatureName = invoice.authorizedBy || options.signerName;
		if (signatureName) {
			doc.font(fonts.regular).fontSize(8.5).fillColor(INK).text(`Name: ${signatureName}`, authX, ay);
			ay += 13;
		}
	}
	doc.font(fonts.regular).fontSize(8.5).fillColor(INK).text(`Date: ${formatDate(new Date())}`, authX, ay);
	ay += 13;

	return Math.max(by, ay) + 20;
};

/** Pins the profile's thank-you footer note to the bottom of whichever page
 *  it lands on, instead of sitting wherever the preceding content happens to
 *  end. Shared by the bill and the receipt. */
const drawFooterNote = (doc: PDFKit.PDFDocument, profile: BillingProfile, fonts: Fonts, L: number, W: number, y: number) => {
	if (!profile.footerNote) return;
	doc.font(fonts.bold).fontSize(8.5);
	const footerH = doc.heightOfString(profile.footerNote, { width: W, align: 'center' });
	let footerY = doc.page.height - doc.page.margins.bottom - footerH;
	if (y > footerY) {
		doc.addPage();
		footerY = doc.page.height - doc.page.margins.bottom - footerH;
	}
	doc.fillColor(INK).text(profile.footerNote, L, footerY, { width: W, align: 'center' });
};

/**
 * Renders an agency bill (AdminInvoice) — the standard, always-"BILL"-labeled
 * document per the human's instruction ("Invoice will say bill"). Resolves
 * with the finished PDF as a Buffer.
 */
export async function buildAdminInvoicePdf(
	invoice: any,
	profile: BillingProfile,
	options: InvoicePdfOptions = {}
): Promise<Buffer> {
	const signatureBuffer = options.signed ? await loadSignatureBuffer(options.signatureUrl) : null;
	const logoBuffer = await loadLogoBuffer(profile);

	return new Promise((resolve, reject) => {
		try {
			const doc = new PDFDocument({ size: 'A4', margin: 40 });
			const fonts = registerFonts(doc);
			const chunks: Buffer[] = [];
			doc.on('data', (c: Buffer) => chunks.push(c));
			doc.on('end', () => resolve(Buffer.concat(chunks)));
			doc.on('error', reject);
			doc.on('pageAdded', () => drawWatermark(doc, profile, fonts));

			const L = doc.page.margins.left;
			const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
			const R = L + W;
			const currency = invoice.currency || 'BDT';

			drawWatermark(doc, profile, fonts);
			let y = drawMasthead(doc, profile, 'BILL', L, W, R, fonts, logoBuffer, invoice.code);

			// ── Bill To (left) / Date·REF·Status (right) ─────────────────────
			const infoW = 160;
			const infoX = R - infoW;

			const billToBottom = drawBillTo(doc, fonts, invoice, 'Bill To', L, R - infoW - L - 20, y);
			const infoBottom = drawInfoRows(
				doc,
				fonts,
				[
					['Date', formatDate(invoice.issueDate)],
					['REF', invoice.code || '—'],
					['Status', (invoice.status || '').toUpperCase()],
				],
				infoX,
				infoW,
				y
			);

			y = Math.max(billToBottom, infoBottom) + 14;

			// ── Bill From ──────────────────────────────────────────────────
			sectionLabel(doc, fonts, 'Bill From', L, y);
			y += 14;
			if (invoice.billFromOverride) {
				doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text(invoice.billFromOverride, L, y, { width: W });
				y += doc.heightOfString(invoice.billFromOverride, { width: W }) + 6;
			} else {
				doc.font(fonts.bold).fontSize(10).fillColor(INK).text(profile.company.name, L, y);
				y += 13;
				doc.font(fonts.regular).fontSize(9).fillColor(MUTED);
				profile.company.addressLines?.forEach(line => {
					doc.text(line, L, y);
					y += 11;
				});
			}

			y += 12;

			// ── Items table ────────────────────────────────────────────────
			const items: any[] = invoice.items || [];
			y = drawItemsTable(doc, fonts, items, L, W, R, currency, invoice.total, y) + 14;

			// ── Payment method / Amount-in-words (left) + Totals (right) ────
			if (y + 90 > doc.page.height - 220) {
				doc.addPage();
				y = doc.page.margins.top;
			}

			const summaryTop = y;
			const leftW = 300;
			const rightColW = 190;
			const rightX = R - rightColW;

			sectionLabel(doc, fonts, 'Payment Method', L, y);
			doc.font(fonts.regular).fontSize(9).fillColor(INK).text(invoice.paymentMethod || '—', L, y + 13, { width: leftW });

			sectionLabel(doc, fonts, 'Amount in Words', L, y + 34);
			const amountWords = invoice.amountInWords || amountToWords(invoice.total, currency);
			doc.font(fonts.regular).fontSize(9).fillColor(INK).text(amountWords, L, y + 47, { width: leftW });
			const leftBottom = y + 47 + doc.heightOfString(amountWords, { width: leftW });

			const totalsRows: [string, number][] = [['Subtotal', invoice.subTotal]];
			if (Number(invoice.tax) > 0) totalsRows.push(['Tax', invoice.tax]);
			if (Number(invoice.shipping) > 0) totalsRows.push(['Shipping', invoice.shipping]);
			if (Number(invoice.others) > 0) totalsRows.push(['Others', invoice.others]);

			let ry = summaryTop;
			totalsRows.forEach(([label, value]) => {
				doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text(label, rightX, ry, { width: rightColW / 2 });
				doc.font(fonts.medium).fontSize(9).fillColor(INK)
					.text(`${currency} ${money(value)}`, rightX + rightColW / 2, ry, { width: rightColW / 2, align: 'right' });
				ry += 17;
			});
			doc.moveTo(rightX, ry + 2).lineTo(R, ry + 2).lineWidth(1).strokeColor(INK).stroke();
			ry += 12;
			doc.font(fonts.bold).fontSize(11).fillColor(INK).text('Total', rightX, ry, { width: rightColW / 2 });
			doc.text(`${currency} ${money(invoice.total)}`, rightX + rightColW / 2, ry, { width: rightColW / 2, align: 'right' });
			ry += 20;

			y = Math.max(leftBottom, ry) + 20;

			// ── Bank Details + Authorized By ──────────────────────────────
			if (y + 130 > doc.page.height - 90) {
				doc.addPage();
				y = doc.page.margins.top;
			}
			y = drawBankAndAuthorized(doc, fonts, invoice, options, options.bankAccount ?? null, signatureBuffer, L, R, y);

			drawFooterNote(doc, profile, fonts, L, W, y);

			doc.end();
		} catch (error) {
			reject(error);
		}
	});
}

/**
 * A deliberately shorter, "RECEIPT"-labeled document — only offered for
 * already-paid invoices. Modeled after the clean, minimal receipts sent by
 * providers like AWS: the same itemized table and totals as the bill, then a
 * compact "amount paid" confirmation instead of a second full summary.
 */
export async function buildAdminReceiptPdf(
	invoice: any,
	profile: BillingProfile,
	options: InvoicePdfOptions = {}
): Promise<Buffer> {
	const signatureBuffer = options.signed ? await loadSignatureBuffer(options.signatureUrl) : null;
	const logoBuffer = await loadLogoBuffer(profile);

	return new Promise((resolve, reject) => {
		try {
			const doc = new PDFDocument({ size: 'A4', margin: 40 });
			const fonts = registerFonts(doc);
			const chunks: Buffer[] = [];
			doc.on('data', (c: Buffer) => chunks.push(c));
			doc.on('end', () => resolve(Buffer.concat(chunks)));
			doc.on('error', reject);
			doc.on('pageAdded', () => drawWatermark(doc, profile, fonts));

			const L = doc.page.margins.left;
			const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
			const R = L + W;
			const currency = invoice.currency || 'BDT';

			drawWatermark(doc, profile, fonts);
			let y = drawMasthead(doc, profile, 'RECEIPT', L, W, R, fonts, logoBuffer, invoice.code);

			// ── Billed To (left) / Date·REF (right) ───────────────────────
			const infoW = 160;
			const infoX = R - infoW;

			const billToBottom = drawBillTo(doc, fonts, invoice, 'Billed To', L, R - infoW - L - 20, y);
			const infoBottom = drawInfoRows(
				doc,
				fonts,
				[
					['Date Paid', formatDate(new Date())],
					['REF', invoice.code || '—'],
				],
				infoX,
				infoW,
				y
			);

			y = Math.max(billToBottom, infoBottom) + 20;

			// ── Items table ────────────────────────────────────────────────
			const items: any[] = invoice.items || [];
			y = drawItemsTable(doc, fonts, items, L, W, R, currency, invoice.total, y) + 20;

			// ── Amount paid confirmation strip ────────────────────────────
			if (y + 60 > doc.page.height - 220) {
				doc.addPage();
				y = doc.page.margins.top;
			}
			const paidBoxH = 46;
			doc.rect(L, y, W, paidBoxH).fill(PANEL);
			doc.font(fonts.medium).fontSize(8).fillColor(MUTED)
				.text('AMOUNT PAID', L, y + 10, { width: W / 2 - 16, align: 'left', characterSpacing: 1 }, );
			doc.font(fonts.bold).fontSize(16).fillColor(INK)
				.text(`${currency} ${money(invoice.total)}`, L + 16, y + 22, { width: W / 2 - 16 });
			doc.font(fonts.medium).fontSize(8).fillColor(MUTED)
				.text('PAYMENT METHOD', L + W / 2, y + 10, { width: W / 2 - 16, align: 'right', characterSpacing: 1 });
			doc.font(fonts.bold).fontSize(11).fillColor(INK)
				.text(invoice.paymentMethod || '—', L + W / 2, y + 24, { width: W / 2 - 16, align: 'right' });
			y += paidBoxH + 20;

			// ── Bank Details + Authorized By ──────────────────────────────
			if (y + 130 > doc.page.height - 90) {
				doc.addPage();
				y = doc.page.margins.top;
			}
			y = drawBankAndAuthorized(doc, fonts, invoice, options, options.bankAccount ?? null, signatureBuffer, L, R, y);

			drawFooterNote(doc, profile, fonts, L, W, y);

			doc.end();
		} catch (error) {
			reject(error);
		}
	});
}

export default buildAdminInvoicePdf;
