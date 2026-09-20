/**
 * Rasterises the THINKCRYPT brand SVGs into the PNGs the PDF renderer needs.
 *
 * pdfkit cannot draw SVG — it only takes PNG and JPEG — so the vector sources in
 * public/brand/*.svg are baked into PNGs here rather than at request time.
 * Re-run after changing BRAND_TEAL or either source SVG:
 *
 *     node scripts/generateBrandAssets.js
 *
 * The brain is a single stroked path and the wordmark a set of filled paths, so
 * recolouring is a string swap on the source colour each one ships with.
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const brand = path.join(dir, '..', 'public', 'brand');

/** Jade from the supplied logo. Change here, re-run, and every asset follows. */
const BRAND_TEAL = '#12A077';
/** The wordmark's near-black, kept for print legibility on white. */
const INK = '#222222';
/** Watermark tint — pale enough that body text stays readable over it. */
const WATERMARK_TINT = '#BFD9CF';
/** The two colourways the invoice mark is baked in: ink for the light
 *  masthead, white for the reversed footer band. pdfkit cannot recolour an
 *  image, so each colour has to exist as its own PNG. */
const MARK_INK = '#111111';
const MARK_WHITE = '#FFFFFF';

const SOURCE_STROKE = '#222222';
const SOURCE_FILL = '#222222';

/** Repaints every non-`none` fill/stroke in an SVG a single flat colour, for
 *  sources that don't ship in SOURCE_STROKE/SOURCE_FILL — public/tc-logo.svg
 *  is drawn in white, for instance. `fill="none"` is left alone because it
 *  marks the cut-outs that give a mark its shape. */
const repaint = (svg, color) => svg.replace(/(fill|stroke)="(?!none")[^"]*"/g, `$1="${color}"`);

/** Swaps an SVG's intrinsic size while leaving viewBox — and so stroke ratio — alone. */
const resize = (svg, width, height) =>
	svg
		.replace(/width="[\d.]+"/, `width="${width}"`)
		.replace(/height="[\d.]+"/, `height="${height}"`);

const render = async (svg, file) => {
	const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
	await writeFile(path.join(brand, file), buffer);
	const { width, height } = await sharp(buffer).metadata();
	console.log(`  ${file}  ${width}x${height}`);
};

const run = async () => {
	const brainSrc = await readFile(path.join(brand, 'brain.svg'), 'utf8');
	const wordSrc = await readFile(path.join(brand, 'wordmark.svg'), 'utf8');

	// The brain's aspect ratio (44x36) drives every derived height.
	const ratio = 36 / 44;

	console.log('Generating brand assets…');

	// 1. Header mark — teal brain, transparent.
	const markW = 512;
	await render(
		resize(brainSrc.replaceAll(SOURCE_STROKE, BRAND_TEAL), markW, Math.round(markW * ratio)),
		'logo-mark.png'
	);

	// 2. The logo as supplied — white brain on a teal rounded square.
	const badge = 512;
	const inset = Math.round(badge * 0.22);
	const brainInBadge = await sharp(
		Buffer.from(
			resize(
				brainSrc.replaceAll(SOURCE_STROKE, '#FFFFFF'),
				badge - inset * 2,
				Math.round((badge - inset * 2) * ratio)
			)
		)
	)
		.png()
		.toBuffer();

	const badgeBg = Buffer.from(
		`<svg width="${badge}" height="${badge}" xmlns="http://www.w3.org/2000/svg">` +
			`<rect width="${badge}" height="${badge}" rx="${Math.round(
				badge * 0.18
			)}" fill="${BRAND_TEAL}"/></svg>`
	);

	await writeFile(
		path.join(brand, 'logo-badge.png'),
		await sharp(badgeBg)
			.composite([{ input: brainInBadge, gravity: 'center' }])
			.png()
			.toBuffer()
	);
	console.log(`  logo-badge.png  ${badge}x${badge}`);

	// 3. Lockup — teal brain beside the ink wordmark, transparent. This is what
	//    sits in the PDF header, so it is generous in size; pdfkit scales it down.
	const lockMarkW = 180;
	const lockMarkH = Math.round(lockMarkW * ratio);
	const wordW = 760;
	const wordH = Math.round(wordW * (21 / 126));
	const gap = 44;

	const lockMark = await sharp(
		Buffer.from(resize(brainSrc.replaceAll(SOURCE_STROKE, BRAND_TEAL), lockMarkW, lockMarkH))
	)
		.png()
		.toBuffer();
	const lockWord = await sharp(
		Buffer.from(resize(wordSrc.replaceAll(SOURCE_FILL, INK), wordW, wordH))
	)
		.png()
		.toBuffer();

	const lockH = Math.max(lockMarkH, wordH);
	await writeFile(
		path.join(brand, 'logo.png'),
		await sharp({
			create: {
				width: lockMarkW + gap + wordW,
				height: lockH,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.composite([
				{ input: lockMark, left: 0, top: Math.round((lockH - lockMarkH) / 2) },
				{ input: lockWord, left: lockMarkW + gap, top: Math.round((lockH - wordH) / 2) },
			])
			.png()
			.toBuffer()
	);
	console.log(`  logo.png  ${lockMarkW + gap + wordW}x${lockH}`);

	// 4. Invoice mark colourways — the same icon in the two colours the invoice
	//    designs draw it in. Rendered from the icon-only source (public/tc-logo.svg)
	//    that the billing profile points `logoPath` at, so both stay the same mark.
	const iconSrc = await readFile(path.join(brand, '..', 'tc-logo.svg'), 'utf8');
	const iconW = 512;
	const iconH = Math.round(iconW * (54 / 66)); // tc-logo.svg is 66x54.
	for (const [color, file] of [
		[MARK_INK, 'mark-ink.png'],
		[MARK_WHITE, 'mark-white.png'],
	]) {
		await render(resize(repaint(iconSrc, color), iconW, iconH), file);
	}

	// 5. Wordmark colourways — for designs that set the company name as artwork
	//    rather than type.
	for (const [color, file] of [
		[MARK_INK, 'wordmark-ink.png'],
		[MARK_WHITE, 'wordmark-white.png'],
	]) {
		await render(resize(wordSrc.replaceAll(SOURCE_FILL, color), 760, Math.round(760 * (21 / 126))), file);
	}

	// 6. Watermark — large and pale. The renderer still applies its own opacity on
	//    top, so this only has to be light enough not to fight the body text.
	const wmW = 1600;
	await render(
		resize(brainSrc.replaceAll(SOURCE_STROKE, WATERMARK_TINT), wmW, Math.round(wmW * ratio)),
		'watermark.png'
	);

	console.log('Done.');
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
