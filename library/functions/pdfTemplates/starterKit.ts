import { paletteOf, pairingOf } from './theme.js';

/**
 * Small builders shared by the starter templates (starters.ts,
 * startersMore.ts), so a starter reads like its layout.
 */

export const text = (t: string, p: Record<string, any> = {}) => ({ type: 'text', text: t, ...p });
export const fields = (rows: any[], p: Record<string, any> = {}) => ({ type: 'fields', rows, ...p });
export const row = (label: string, value: string, p: Record<string, any> = {}) => ({ label, value, ...p });
export const cols = (columns: any[], p: Record<string, any> = {}) => ({ type: 'columns', columns, ...p });
export const col = (blocks: any[], width = 1, p: Record<string, any> = {}) => ({ blocks, width, ...p });
export const box = (blocks: any[], p: Record<string, any> = {}) => ({ type: 'box', blocks, ...p });
export const space = (height: number) => ({ type: 'spacer', height });
/** A Space that takes the room left (D19): in a row it pushes apart, in the body it pushes to the page bottom. */
export const fillSpace = () => ({ type: 'spacer', height: 4, grow: 1 });
/** Blocks side by side (a box laid out as a row, nothing drawn) — D19. */
export const hrow = (blocks: any[], p: Record<string, any> = {}) => ({ type: 'box', direction: 'row', pad: 0, gap: 8, blocks, ...p });
export const line = (p: Record<string, any> = {}) => ({ type: 'divider', ...p });
export const image = (src: string, p: Record<string, any> = {}) => ({ type: 'image', src, ...p });
export const table = (rows: string, columns: any[], p: Record<string, any> = {}) => ({ type: 'table', rows, columns, ...p });
export const tcol = (header: string, value: string, width = 1, align = 'left') => ({ header, value, width, align });

export const PAGE = { size: 'A4', orientation: 'portrait', margin: [42, 42, 42, 42] };
export const muted = (t: string, p: Record<string, any> = {}) => text(t, { size: 8.5, color: '#6b7280', ...p });
export const label = (t: string, p: Record<string, any> = {}) => text(t, { size: 7.5, weight: 600, color: '#6b7280', upper: true, spacing: 0.8, mb: 3, ...p });

export const footer = [
	line({ mb: 6 }),
	cols([
		col([muted('{{business.name}}  ·  {{business.website}}', { size: 7.5 })], 3),
		col([muted('Page {{page}} of {{pages}}', { size: 7.5, align: 'right' })], 1),
	]),
];

/** A starter's style from a palette and a font pairing (theme.ts, D24) — its colours then follow the theme. */
export const look = (palette: string, pairing: string, p: Record<string, any> = {}) => {
	const c = paletteOf(palette)!;
	const f = pairingOf(pairing)!;
	return {
		font: f.font,
		heading: f.heading,
		size: 9.5,
		color: c.text,
		muted: c.muted,
		accent: c.accent,
		onAccent: c.onAccent,
		soft: c.soft,
		dark: c.dark,
		line: c.line,
		lineHeight: 1.45,
		palette,
		pairing,
		...p,
	};
};

/** Signature lines side by side, each over its caption. */
export const signatures = (captions: string[], p: Record<string, any> = {}) =>
	hrow(
		captions.map(c => box([line({ color: 'text', mb: 4 }), text(c, { size: 8, color: 'muted', align: 'center' })], { pad: 0, grow: 1 })),
		{ gap: 28, ...p }
	);

/** The business block most starters open with: logo, name, address, contacts. */
export const businessBlock = (p: Record<string, any> = {}) =>
	box(
		[
			image('{{business.logo}}', { height: 30, mb: 6 }),
			text('{{business.name}}', { font: 'heading', size: 12.5, weight: 600, mb: 1 }),
			text('{{business.address}}', { size: 8.5, color: 'muted' }),
			text('{{business.phone}}   {{business.email}}', { size: 8.5, color: 'muted' }),
		],
		{ pad: 0, ...p }
	);

export const BUSINESS = {
	name: 'Northwind Studio',
	address: 'Level 4, 22 Gulshan Avenue, Dhaka 1212',
	phone: '+880 1800 000000',
	email: 'hello@northwind.studio',
	website: 'northwind.studio',
	taxId: 'BIN 000123456-0101',
	note: 'Bank: City Bank · A/C 1234 5678 9012 · Routing 225261725',
};

export const CUSTOMER = {
	name: 'Rahman Traders Ltd.',
	address: 'House 12, Road 5, Dhanmondi\nDhaka 1205',
	email: 'accounts@rahmantraders.com',
	phone: '+880 1711 000000',
};
