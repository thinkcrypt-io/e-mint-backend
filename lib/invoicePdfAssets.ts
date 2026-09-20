import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { BillingProfile } from './billingProfile.js';

/**
 * Asset + formatting helpers shared by the invoice PDF designs.
 *
 * The original design (lib/invoicePdf.ts) keeps its own private copies on
 * purpose: it is the design already in production and is deliberately left
 * untouched, so a change made for a newer design can never regress it. New
 * designs import from here.
 */

export type Fonts = {
	regular: string;
	medium: string;
	bold: string;
	/** Display face for the wordmark — Bebas Neue, tall and condensed. Falls
	 *  back to the bold body face when the file isn't in this deployment. */
	display: string;
};

// Suisse Int'l is the agency's own brand typeface (already used on the public
// site). Registered fresh per PDFDocument (pdfkit fonts aren't shared across
// documents); falls back to Helvetica if the font files aren't present in this
// deployment so a missing asset can never break a PDF download.
type BodyFonts = Omit<Fonts, 'display'>;

const FONT_DIR = path.resolve(process.cwd(), 'public/fonts/suisse');
const FONT_FILES: [keyof BodyFonts, string][] = [
	['regular', 'SuisseIntl-Regular.otf'],
	['medium', 'SuisseIntl-Medium.otf'],
	['bold', 'SuisseIntl-Bold.otf'],
];

// Bebas Neue sets the company wordmark — a tall, condensed display face, far
// more distinctive at large sizes than the body grotesk. SIL Open Font License;
// see the OFL.txt beside it.
const DISPLAY_FONT_FILE = path.resolve(process.cwd(), 'public/fonts/bebas/BebasNeue-Regular.ttf');

export const registerFonts = (doc: PDFKit.PDFDocument): Fonts => {
	const body = registerBodyFonts(doc);
	return { ...body, display: registerDisplayFont(doc) ?? body.bold };
};

const registerBodyFonts = (doc: PDFKit.PDFDocument): BodyFonts => {
	const fallback: BodyFonts = { regular: 'Helvetica', medium: 'Helvetica-Bold', bold: 'Helvetica-Bold' };
	try {
		const names = {} as BodyFonts;
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

/** Returns the registered display font's name, or null when the file isn't in
 *  this deployment — the caller then reuses the bold body face, so a missing
 *  font can never break a download. */
const registerDisplayFont = (doc: PDFKit.PDFDocument): string | null => {
	try {
		if (!fs.existsSync(DISPLAY_FONT_FILE)) return null;
		doc.registerFont('Bebas-display', DISPLAY_FONT_FILE);
		return 'Bebas-display';
	} catch (err: any) {
		console.error('Failed to register display font:', err?.message);
		return null;
	}
};

export const formatDate = (value: any): string => {
	const d = value ? new Date(value) : new Date();
	const dd = String(d.getDate()).padStart(2, '0');
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	return `${dd}/${mm}/${d.getFullYear()}`;
};

export const money = (value: any): string => {
	const amount = Number(value || 0);
	return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/** Client street/city/country live in three separate fields — joins whichever
 *  of them are set into one display line instead of only ever showing the
 *  street (`address`), which is often blank when city/country are the only
 *  thing on file. */
export const formatClientAddress = (client: any): string =>
	[client?.address, client?.city, client?.country].filter(Boolean).join(', ');

/** Fetches the signer's signature image and normalizes it to PNG so pdfkit can
 *  embed it — the image is user-uploaded through the generic media picker,
 *  which stores everything as webp (smaller in the library), and pdfkit's
 *  doc.image() only decodes JPEG/PNG. Returns null (never throws) so a broken/
 *  unreachable/undecodable image never breaks the PDF. */
export const loadSignatureBuffer = async (url?: string): Promise<Buffer | null> => {
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

/** The colourways a design can ask the brand mark for. */
export type MarkVariant = 'ink' | 'white';

const MARK_COLORS: Record<MarkVariant, string> = { ink: '#111111', white: '#ffffff' };

/**
 * Loads the brand mark in one colour, as a PNG pdfkit can draw.
 *
 * pdfkit can neither decode SVG nor recolour an image, so each colourway has to
 * arrive as its own raster. The pre-baked files from
 * scripts/generateBrandAssets.js are preferred; if one is missing (a deployment
 * that hasn't run the script, or a profile pointing somewhere custom) the SVG at
 * `logoPath` is repainted and rasterised on the spot instead, so the mark still
 * shows up in the right colour.
 *
 * Results are cached by resolved path + colour: the same handful of marks are
 * drawn on every invoice, and rasterising an SVG is far and away the most
 * expensive thing in a PDF render.
 *
 * Returns null (never throws) so a missing/corrupt/unreadable logo can never
 * break a download.
 */
export const loadBrandMark = async (profile: BillingProfile, variant: MarkVariant): Promise<Buffer | null> => {
	const baked = profile.marks?.[variant];
	if (baked) {
		const buffer = await readMarkFile(path.resolve(process.cwd(), baked));
		if (buffer) return buffer;
	}
	if (!profile.logoPath) return null;
	return renderMarkFromSvg(path.resolve(process.cwd(), profile.logoPath), MARK_COLORS[variant]);
};

const markCache = new Map<string, Buffer | null>();

const readMarkFile = async (absPath: string): Promise<Buffer | null> => {
	if (markCache.has(absPath)) return markCache.get(absPath) as Buffer | null;
	let buffer: Buffer | null = null;
	try {
		if (fs.existsSync(absPath) && !absPath.toLowerCase().endsWith('.svg')) buffer = fs.readFileSync(absPath);
	} catch (err: any) {
		console.error('Failed to read brand mark:', err?.message);
	}
	markCache.set(absPath, buffer);
	return buffer;
};

const renderMarkFromSvg = async (absPath: string, color: string): Promise<Buffer | null> => {
	const key = `${absPath}|${color}`;
	if (markCache.has(key)) return markCache.get(key) as Buffer | null;
	let buffer: Buffer | null = null;
	try {
		if (fs.existsSync(absPath)) {
			const svg = fs.readFileSync(absPath, 'utf8');
			buffer = await sharp(Buffer.from(recolorSvg(svg, color)), { density: 300 }).png().toBuffer();
		}
	} catch (err: any) {
		console.error('Failed to render brand mark from SVG:', err?.message);
	}
	markCache.set(key, buffer);
	return buffer;
};

/** Repaints every non-`none` fill/stroke in an SVG a single flat color. The
 *  brand mark is a one-color silhouette, so a blanket swap is exactly right
 *  here — `fill="none"` is left alone because it marks the cut-outs that give
 *  the mark its shape. */
const recolorSvg = (svg: string, color: string): string =>
	svg.replace(/(fill|stroke)="(?!none")[^"]*"/g, `$1="${color}"`);
