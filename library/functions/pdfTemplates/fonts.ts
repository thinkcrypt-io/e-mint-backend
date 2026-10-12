import fs from 'fs';
import path from 'path';
// @ts-expect-error fontkit (pdfkit's own font reader) ships no types
import * as fontkit from 'fontkit';

/**
 * The fonts a template can use (docs/pdf-templates D9) and how text is split
 * across them. Geist Sans / Mono are files (the panel's own font, so the
 * designer matches the PDF); Helvetica, Times and Courier are the PDF's
 * built-ins. A character the chosen font has no glyph for — Bangla, ৳ —
 * goes to Noto Sans Bengali, character by character, so mixed text prints.
 */

export type Family = 'sans' | 'mono' | 'helvetica' | 'times' | 'courier';
export type Weight = 400 | 500 | 600 | 700;

type FaceSource = { file: string } | { std: string };
export type Face = { name: string; source: FaceSource; fakeItalic: boolean };

const GEIST = path.resolve(process.cwd(), 'public/fonts/geist');
const NOTO = path.resolve(process.cwd(), 'node_modules/@fontsource/noto-sans-bengali/files');

const file = (name: string, f: string): Face => ({ name, source: { file: f }, fakeItalic: true });
const std = (name: string): Face => ({ name, source: { std: name }, fakeItalic: false });

/** family → weight → [upright, italic]. */
const FACES: Record<Family, Partial<Record<Weight, [Face, Face]>>> = {
	sans: {
		400: [file('Geist', `${GEIST}/Geist-Regular.ttf`), file('Geist', `${GEIST}/Geist-Regular.ttf`)],
		500: [file('Geist-Medium', `${GEIST}/Geist-Medium.ttf`), file('Geist-Medium', `${GEIST}/Geist-Medium.ttf`)],
		600: [file('Geist-SemiBold', `${GEIST}/Geist-SemiBold.ttf`), file('Geist-SemiBold', `${GEIST}/Geist-SemiBold.ttf`)],
		700: [file('Geist-Bold', `${GEIST}/Geist-Bold.ttf`), file('Geist-Bold', `${GEIST}/Geist-Bold.ttf`)],
	},
	mono: {
		400: [file('GeistMono', `${GEIST}/GeistMono-Regular.ttf`), file('GeistMono', `${GEIST}/GeistMono-Regular.ttf`)],
		700: [file('GeistMono-Bold', `${GEIST}/GeistMono-Bold.ttf`), file('GeistMono-Bold', `${GEIST}/GeistMono-Bold.ttf`)],
	},
	helvetica: {
		400: [std('Helvetica'), std('Helvetica-Oblique')],
		700: [std('Helvetica-Bold'), std('Helvetica-BoldOblique')],
	},
	times: {
		400: [std('Times-Roman'), std('Times-Italic')],
		700: [std('Times-Bold'), std('Times-BoldItalic')],
	},
	courier: {
		400: [std('Courier'), std('Courier-Oblique')],
		700: [std('Courier-Bold'), std('Courier-BoldOblique')],
	},
};

/** Tried in order when the chosen face has no glyph. */
const FALLBACKS: Record<'regular' | 'bold', Face[]> = {
	regular: [
		file('NotoBengali', `${NOTO}/noto-sans-bengali-bengali-400-normal.woff`),
		file('NotoBengali-Latin', `${NOTO}/noto-sans-bengali-latin-400-normal.woff`),
		file('Geist', `${GEIST}/Geist-Regular.ttf`),
	],
	bold: [
		file('NotoBengali-Bold', `${NOTO}/noto-sans-bengali-bengali-700-normal.woff`),
		file('NotoBengali-Latin-Bold', `${NOTO}/noto-sans-bengali-latin-700-normal.woff`),
		file('Geist-Bold', `${GEIST}/Geist-Bold.ttf`),
	],
};

/** The nearest weight a family has. */
export const faceFor = (family: Family, weight: number, italic: boolean): Face => {
	const faces = FACES[family] || FACES.sans;
	const have = (Object.keys(faces).map(Number) as Weight[]).sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight) || b - a);
	const pair = faces[have[0]]!;
	return pair[italic ? 1 : 0];
};

/* ------------------------------------------------------------ coverage */

const buffers = new Map<string, Buffer | null>();
const parsed = new Map<string, any>();

const bufferOf = (f: string): Buffer | null => {
	if (!buffers.has(f)) {
		try {
			buffers.set(f, fs.readFileSync(f));
		} catch {
			buffers.set(f, null);
		}
	}
	return buffers.get(f)!;
};

const fontkitOf = (f: string) => {
	if (!parsed.has(f)) {
		const b = bufferOf(f);
		try {
			parsed.set(f, b ? (fontkit as any).create(b) : null);
		} catch {
			parsed.set(f, null);
		}
	}
	return parsed.get(f);
};

// What the PDF built-ins can print (WinAnsi): Latin-1 and a few extras.
const WIN_ANSI_EXTRA = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178]);

const covers = (face: Face, cp: number): boolean => {
	if ('std' in face.source) return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(cp);
	const font = fontkitOf(face.source.file);
	return !!font && font.hasGlyphForCodePoint(cp);
};

const coverCache = new Map<string, boolean>();
const coversCached = (face: Face, cp: number) => {
	const key = `${face.name}|${cp}`;
	let v = coverCache.get(key);
	if (v === undefined) {
		v = covers(face, cp);
		if (coverCache.size > 20000) coverCache.clear();
		coverCache.set(key, v);
	}
	return v;
};

// Joiners, marks and variation selectors stay with the character before them.
const STICKY = /[\p{M}‌‍︀-️]/u;

export type Run = { text: string; face: Face };

/** The text in runs, each in the first face that can print it. */
export const runsOf = (text: string, face: Face, bold: boolean): Run[] => {
	const chain = [face, ...FALLBACKS[bold ? 'bold' : 'regular']];
	const runs: Run[] = [];
	let cur: Run | null = null;
	for (const ch of text) {
		const cp = ch.codePointAt(0)!;
		const use: Face = cur && (STICKY.test(ch) || ch === ' ') ? cur.face : chain.find(f => coversCached(f, cp)) || face;
		if (cur && cur.face === use) cur.text += ch;
		else {
			cur = { text: ch, face: use };
			runs.push(cur);
		}
	}
	return runs;
};

/* -------------------------------------------------- one document's fonts */

/** Registers faces on a document as they're first used, and measures with them. */
export class DocFonts {
	private registered = new Set<string>();
	private widths = new Map<string, number>();
	private metrics = new Map<string, { ascent: number; descent: number }>();

	constructor(private doc: PDFKit.PDFDocument) {}

	use(face: Face, size: number) {
		if (!this.registered.has(face.name)) {
			if ('file' in face.source) {
				const b = bufferOf(face.source.file);
				if (b) this.doc.registerFont(face.name, b);
				else this.doc.registerFont(face.name, 'Helvetica');
			}
			this.registered.add(face.name);
		}
		this.doc.font('std' in face.source ? face.source.std : face.name).fontSize(size);
	}

	width(text: string, face: Face, size: number, spacing = 0): number {
		const key = `${face.name}|${size}|${spacing}|${text}`;
		let w = this.widths.get(key);
		if (w === undefined) {
			this.use(face, size);
			// pdfkit counts the spacing between characters; CSS (the designer) after every one — spaces too.
			w = this.doc.widthOfString(text, { characterSpacing: spacing } as any) + (text && spacing ? spacing : 0);
			if (this.widths.size > 50000) this.widths.clear();
			this.widths.set(key, w);
		}
		return w;
	}

	/** Ascent and descent (descent negative) at this size. */
	vertical(face: Face, size: number) {
		let m = this.metrics.get(face.name);
		if (!m) {
			this.use(face, size);
			const f: any = (this.doc as any)._font;
			m = { ascent: (f?.ascender ?? 750) / 1000, descent: (f?.descender ?? -250) / 1000 };
			this.metrics.set(face.name, m);
		}
		return { ascent: m.ascent * size, descent: m.descent * size };
	}
}
