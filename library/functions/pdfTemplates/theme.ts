/**
 * Themes for PDF templates (docs/pdf-templates D24). A template's `style`
 * holds its look: a body font and a heading font, and seven colour roles.
 * Any colour on a block may name a role ("accent", "soft"…) instead of a
 * hex, so changing the theme recolours the whole page; the renderer
 * resolves roles to hex first (`resolveTheme`).
 *
 * Presets: colour palettes and font pairings mix and match; a "look" is
 * a named pair of them. `applyLook` puts one on a template, first turning
 * the literal colours that play a role (its accent, a light tint of it,
 * white text on it…) into role names, so older templates follow too.
 *
 * Plain TypeScript, no imports: the admin keeps a COPY in
 * components/library/pdf/theme.ts — keep the two in step.
 */

/* ---------------------------------------------------------------- roles */

export const ROLES = ['text', 'muted', 'accent', 'onAccent', 'soft', 'dark', 'line'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_INFO: Record<Role, { label: string; hint: string }> = {
	text: { label: 'Text', hint: 'Most words on the page' },
	muted: { label: 'Muted', hint: 'Labels, notes, small print' },
	accent: { label: 'Accent', hint: 'The brand colour: bands, table headers, totals' },
	onAccent: { label: 'On accent', hint: 'Words on the accent colour' },
	soft: { label: 'Soft', hint: 'Light panels and tints' },
	dark: { label: 'Dark', hint: 'Deep bands and strong headings' },
	line: { label: 'Lines', hint: 'Table lines and borders' },
};
export const isRole = (v: any): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** Block properties that hold a colour. */
export const COLOR_PROPS = ['color', 'bg', 'borderColor', 'headerBg', 'headerColor', 'lineColor'] as const;

/* --------------------------------------------------------------- fonts */

/** Every font a template can print in; `heading` on a block means the theme's heading font. */
export const FONT_FAMILIES: { key: string; label: string; group: 'Sans' | 'Serif' | 'Mono'; builtIn?: boolean }[] = [
	{ key: 'sans', label: 'Geist', group: 'Sans' },
	{ key: 'inter', label: 'Inter', group: 'Sans' },
	{ key: 'dmsans', label: 'DM Sans', group: 'Sans' },
	{ key: 'manrope', label: 'Manrope', group: 'Sans' },
	{ key: 'montserrat', label: 'Montserrat', group: 'Sans' },
	{ key: 'poppins', label: 'Poppins', group: 'Sans' },
	{ key: 'plexsans', label: 'IBM Plex Sans', group: 'Sans' },
	{ key: 'grotesk', label: 'Space Grotesk', group: 'Sans' },
	{ key: 'playfair', label: 'Playfair Display', group: 'Serif' },
	{ key: 'garamond', label: 'EB Garamond', group: 'Serif' },
	{ key: 'merriweather', label: 'Merriweather', group: 'Serif' },
	{ key: 'sourceserif', label: 'Source Serif', group: 'Serif' },
	{ key: 'crimson', label: 'Crimson Pro', group: 'Serif' },
	{ key: 'plexserif', label: 'IBM Plex Serif', group: 'Serif' },
	{ key: 'mono', label: 'Geist Mono', group: 'Mono' },
	// The PDF's own three: not embedded, Latin-1 only (other letters fall back to Geist / Noto).
	{ key: 'helvetica', label: 'Helvetica', group: 'Sans', builtIn: true },
	{ key: 'times', label: 'Times', group: 'Serif', builtIn: true },
	{ key: 'courier', label: 'Courier', group: 'Mono', builtIn: true },
];
export const FAMILY_KEYS = FONT_FAMILIES.map(f => f.key);
export const familyLabel = (k?: string) => FONT_FAMILIES.find(f => f.key === k)?.label || 'Geist';

/* -------------------------------------------------------------- presets */

export type Palette = { key: string; name: string } & Record<Role, string>;
export type Pairing = { key: string; name: string; heading: string; font: string; note: string };
export type Look = { key: string; name: string; palette: string; pairing: string };

export const PALETTES: Palette[] = [
	{ key: 'indigo', name: 'Indigo', text: '#111827', muted: '#6b7280', accent: '#4f46e5', onAccent: '#ffffff', soft: '#eef2ff', dark: '#312e81', line: '#e0e3ef' },
	{ key: 'ocean', name: 'Ocean', text: '#0f172a', muted: '#64748b', accent: '#0891b2', onAccent: '#ffffff', soft: '#ecfeff', dark: '#164e63', line: '#dbe7ee' },
	{ key: 'emerald', name: 'Emerald', text: '#111827', muted: '#6b7280', accent: '#059669', onAccent: '#ffffff', soft: '#ecfdf5', dark: '#064e3b', line: '#dce9e3' },
	{ key: 'rose', name: 'Rose', text: '#1c1917', muted: '#78716c', accent: '#e11d48', onAccent: '#ffffff', soft: '#fff1f2', dark: '#881337', line: '#efe1e3' },
	{ key: 'amber', name: 'Amber', text: '#1c1917', muted: '#78716c', accent: '#b45309', onAccent: '#ffffff', soft: '#fffbeb', dark: '#78350f', line: '#ece4d6' },
	{ key: 'graphite', name: 'Graphite', text: '#111111', muted: '#666666', accent: '#111111', onAccent: '#ffffff', soft: '#f3f3f3', dark: '#000000', line: '#dddddd' },
	{ key: 'plum', name: 'Plum', text: '#1e1b2e', muted: '#6b6880', accent: '#7c3aed', onAccent: '#ffffff', soft: '#f5f3ff', dark: '#4c1d95', line: '#e4e0f0' },
	{ key: 'teal', name: 'Teal', text: '#1f2937', muted: '#6b7280', accent: '#0d9488', onAccent: '#ffffff', soft: '#f0fdfa', dark: '#134e4a', line: '#dbe9e7' },
	{ key: 'navy', name: 'Navy & gold', text: '#0f172a', muted: '#64748b', accent: '#1e3a8a', onAccent: '#ffffff', soft: '#f8f5ec', dark: '#0b1a45', line: '#d9c48f' },
	{ key: 'terracotta', name: 'Terracotta', text: '#292524', muted: '#78716c', accent: '#c2410c', onAccent: '#ffffff', soft: '#fdf4ee', dark: '#7c2d12', line: '#eadfd6' },
	{ key: 'forest', name: 'Forest', text: '#14211a', muted: '#5f6f65', accent: '#166534', onAccent: '#ffffff', soft: '#f1f7ef', dark: '#0f3d22', line: '#d9e4d6' },
	{ key: 'sunflower', name: 'Sunflower', text: '#1c1917', muted: '#6b6459', accent: '#facc15', onAccent: '#1c1917', soft: '#fefce8', dark: '#3f3a1f', line: '#ece6c8' },
];

export const PAIRINGS: Pairing[] = [
	{ key: 'modern', name: 'Modern', heading: 'sans', font: 'sans', note: 'Geist throughout — clean, the panel’s own' },
	{ key: 'clean', name: 'Clean', heading: 'inter', font: 'inter', note: 'Inter throughout — neutral and very readable' },
	{ key: 'editorial', name: 'Editorial', heading: 'playfair', font: 'inter', note: 'Playfair Display headings, Inter text' },
	{ key: 'elegant', name: 'Elegant', heading: 'playfair', font: 'sourceserif', note: 'Playfair Display headings, Source Serif text' },
	{ key: 'classic', name: 'Classic', heading: 'garamond', font: 'garamond', note: 'EB Garamond — book-like, formal' },
	{ key: 'literary', name: 'Literary', heading: 'crimson', font: 'crimson', note: 'Crimson Pro — a warm book serif' },
	{ key: 'newsroom', name: 'Newsroom', heading: 'merriweather', font: 'plexsans', note: 'Merriweather headings, IBM Plex Sans text' },
	{ key: 'corporate', name: 'Corporate', heading: 'plexserif', font: 'plexsans', note: 'IBM Plex Serif headings, Plex Sans text' },
	{ key: 'geometric', name: 'Geometric', heading: 'montserrat', font: 'montserrat', note: 'Montserrat — wide and confident' },
	{ key: 'friendly', name: 'Friendly', heading: 'poppins', font: 'manrope', note: 'Poppins headings, Manrope text' },
	{ key: 'soft', name: 'Soft', heading: 'dmsans', font: 'dmsans', note: 'DM Sans — round and calm' },
	{ key: 'tech', name: 'Tech', heading: 'grotesk', font: 'grotesk', note: 'Space Grotesk — a technical edge' },
];

export const LOOKS: Look[] = [
	{ key: 'studio', name: 'Studio', palette: 'indigo', pairing: 'modern' },
	{ key: 'editorial', name: 'Editorial', palette: 'rose', pairing: 'editorial' },
	{ key: 'heritage', name: 'Heritage', palette: 'navy', pairing: 'classic' },
	{ key: 'fresh', name: 'Fresh', palette: 'emerald', pairing: 'friendly' },
	{ key: 'tech', name: 'Tech', palette: 'ocean', pairing: 'tech' },
	{ key: 'mono', name: 'Mono', palette: 'graphite', pairing: 'clean' },
	{ key: 'warm', name: 'Warm', palette: 'terracotta', pairing: 'literary' },
	{ key: 'bold', name: 'Bold', palette: 'sunflower', pairing: 'geometric' },
	{ key: 'forest', name: 'Forest', palette: 'forest', pairing: 'newsroom' },
	{ key: 'royal', name: 'Royal', palette: 'plum', pairing: 'elegant' },
	{ key: 'calm', name: 'Calm', palette: 'teal', pairing: 'soft' },
	{ key: 'ledger', name: 'Ledger', palette: 'amber', pairing: 'corporate' },
];

export const paletteOf = (k?: string) => PALETTES.find(p => p.key === k);
export const pairingOf = (k?: string) => PAIRINGS.find(p => p.key === k);
export const lookOf = (k?: string) => LOOKS.find(l => l.key === k);

/* --------------------------------------------------------------- colour */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const rgbOf = (hex: string): [number, number, number] => {
	let h = hex.replace('#', '');
	if (h.length === 3) h = h.replace(/./g, c => c + c);
	return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as any;
};
const hexOf = (rgb: number[]) => '#' + rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');
/** `a` moved towards `b` by `t` (0–1). */
export const mix = (a: string, b: string, t: number) => {
	const [x, y] = [rgbOf(a), rgbOf(b)];
	return hexOf(x.map((c, i) => c + (y[i] - c) * t));
};
const hsl = (hex: string) => {
	const [r, g, b] = rgbOf(hex).map(c => c / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	if (!d) return { h: 0, s: 0, l };
	const s = d / (1 - Math.abs(2 * l - 1));
	const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return { h: (h * 60 + 360) % 360, s, l };
};
const luminance = (hex: string) => {
	const [r, g, b] = rgbOf(hex).map(c => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Readable words on `bg`: white, or near-black when the background is light. */
export const readableOn = (bg: string) => (luminance(bg) > 0.45 ? '#111111' : '#ffffff');

/* ---------------------------------------------------------------- style */

export type ThemeStyle = {
	font: string;
	heading?: string;
	size: number;
	lineHeight: number;
	color: string;
	muted: string;
	accent: string;
	onAccent?: string;
	soft?: string;
	dark?: string;
	line?: string;
	/** The presets last put on (for the Theme tab to show them picked). */
	palette?: string;
	pairing?: string;
};

/** Each role's colour; the newer roles, when a template doesn't have them yet, come from its accent. */
export const roleColors = (s: ThemeStyle): Record<Role, string> => {
	const accent = HEX.test(s.accent || '') ? s.accent : '#2563eb';
	return {
		text: s.color,
		muted: s.muted,
		accent,
		onAccent: s.onAccent || readableOn(accent),
		soft: s.soft || mix(accent, '#ffffff', 0.92),
		dark: s.dark || mix(accent, '#000000', 0.45),
		line: s.line || '#e5e7eb',
	};
};

/** A colour value → hex: a role becomes the theme's colour, anything else stays. */
export const paint = (v: any, s: ThemeStyle): any => (isRole(v) ? roleColors(s)[v] : v);

/* ------------------------------------------------------------- walking */

type Blocky = { [k: string]: any };
const mapBlocks = (list: any, fn: (b: Blocky, parentBg?: string) => Blocky, parentBg?: string): any =>
	Array.isArray(list)
		? list.map((raw: Blocky) => {
				if (!raw || typeof raw !== 'object') return raw;
				const b = fn({ ...raw }, parentBg);
				const bg = b.bg || parentBg;
				if (Array.isArray(b.blocks)) b.blocks = mapBlocks(b.blocks, fn, bg);
				if (Array.isArray(b.columns) && b.type === 'columns') b.columns = b.columns.map((c: any) => (c && Array.isArray(c.blocks) ? { ...c, blocks: mapBlocks(c.blocks, fn, bg) } : c));
				return b;
			})
		: list;

const mapParts = <T extends Blocky>(t: T, fn: (b: Blocky, parentBg?: string) => Blocky): T => ({
	...t,
	header: mapBlocks(t.header, fn),
	body: mapBlocks(t.body, fn),
	footer: mapBlocks(t.footer, fn),
	...(Array.isArray(t.free) && { free: mapBlocks(t.free, fn) }),
});

/** The template with every role resolved to hex and `font: 'heading'` to the heading family — what's drawn. */
export const resolveTheme = <T extends Blocky>(t: T): T => {
	const s = t.style as ThemeStyle;
	if (!s) return t;
	const heading = s.heading || s.font;
	return mapParts(t, b => {
		for (const k of COLOR_PROPS) if (isRole(b[k])) b[k] = paint(b[k], s);
		if (b.font === 'heading') b.font = heading;
		return b;
	});
};

/** Does any block use the heading font? */
export const usesHeading = (t: Blocky) => {
	let yes = false;
	mapParts(t, b => {
		if (b.font === 'heading') yes = true;
		return b;
	});
	return yes;
};

/** Does the template use roles anywhere? */
export const usesRoles = (t: Blocky) => {
	let yes = false;
	mapParts(t, b => {
		if (COLOR_PROPS.some(k => isRole(b[k]))) yes = true;
		return b;
	});
	return yes;
};

/**
 * Literal colours that play a role → the role's name, so a theme can change
 * them: the theme's own colours, then by look — tints / shades of the accent's
 * hue, light grey lines, white words on an accent or dark background.
 */
export const adoptRoles = <T extends Blocky>(t: T): { template: T; changed: number } => {
	const s = t.style as ThemeStyle;
	if (!s) return { template: t, changed: 0 };
	const r = roleColors(s);
	const a = hsl(r.accent);
	const accentIsGrey = a.s < 0.15;
	let changed = 0;
	const found: Partial<Record<'soft' | 'dark' | 'line', string>> = {};
	const roleFor = (k: string, v: string, b: Blocky, parentBg?: string): Role | undefined => {
		const c = v.toLowerCase();
		const textProp = k === 'color' || k === 'headerColor';
		const bgProp = k === 'bg' || k === 'headerBg';
		// Words on an accent / dark background.
		const under = k === 'headerColor' ? b.headerBg : b.type === 'text' && b.bg ? b.bg : parentBg;
		const underRole = isRole(under) ? under : under && under.toLowerCase() === r.accent.toLowerCase() ? 'accent' : under && under.toLowerCase() === r.dark.toLowerCase() ? 'dark' : undefined;
		if (textProp && underRole === 'accent' && (c === r.onAccent.toLowerCase() || c === '#ffffff' || c === '#fff')) return 'onAccent';
		// White / grey words on a dark band stay as they are.
		if (textProp && underRole === 'dark' && hsl(c).s < 0.2) return undefined;
		// The theme's own colours.
		if (textProp && c === r.text.toLowerCase()) return 'text';
		if (textProp && c === r.muted.toLowerCase()) return 'muted';
		if (c === r.accent.toLowerCase() && (bgProp || !accentIsGrey || k === 'lineColor' || k === 'borderColor')) return 'accent';
		if (c === r.soft.toLowerCase()) return 'soft';
		if (c === r.dark.toLowerCase()) return 'dark';
		if ((k === 'lineColor' || k === 'borderColor') && c === r.line.toLowerCase()) return 'line';
		if (!HEX.test(c)) return undefined;
		const x = hsl(c);
		// Greys for words: near-black is the text, mid-grey is muted (not on a coloured background).
		if (textProp && !underRole && x.l < 0.2) return 'text';
		if (textProp && !underRole && x.s < 0.25 && x.l >= 0.35 && x.l <= 0.7) return 'muted';
		if (accentIsGrey) return undefined;
		// By look: the accent's hue, lighter or darker.
		const sameHue = x.s > 0.2 && Math.min(Math.abs(x.h - a.h), 360 - Math.abs(x.h - a.h)) < 28;
		if (sameHue && x.l > 0.82) return 'soft';
		if (sameHue && x.l < 0.32) return 'dark';
		if (sameHue && !bgProp && x.l > 0.32 && x.l < 0.82) return 'accent';
		if (sameHue && bgProp) return x.l >= 0.6 ? 'soft' : 'accent';
		// A near-black band or panel: the theme's dark.
		if (bgProp && x.l < 0.2) return 'dark';
		if ((k === 'lineColor' || k === 'borderColor') && ((x.s < 0.2 && x.l > 0.75) || (x.s < 0.45 && x.l > 0.85))) return 'line';
		return undefined;
	};
	const template = mapParts(t, (b, parentBg) => {
		const before = { bg: b.bg, headerBg: b.headerBg };
		for (const k of COLOR_PROPS) {
			const v = b[k];
			if (typeof v !== 'string' || isRole(v)) continue;
			const role = roleFor(k, v, { ...b, ...before }, parentBg);
			if (role) {
				// The first tint / shade / line found becomes the role's colour when the style has none yet, so the page looks as before.
				if ((role === 'soft' || role === 'dark' || role === 'line') && !s[role] && !found[role]) found[role] = v.toLowerCase();
				b[k] = role;
				changed++;
			}
		}
		return b;
	});
	return { template: { ...template, style: { ...s, ...found } }, changed };
};

/**
 * Puts a palette and / or a font pairing on a template (either may be left
 * out — mix and match). Literal colours become roles first (`adoptRoles`).
 */
export const applyLook = <T extends Blocky>(t: T, pick: { look?: string; palette?: string; pairing?: string }): { template: T; adopted: number } => {
	const look = lookOf(pick.look);
	const palette = paletteOf(pick.palette || look?.palette);
	const pairing = pairingOf(pick.pairing || look?.pairing);
	const adopted = palette ? adoptRoles(t) : { template: t, changed: 0 };
	const template = adopted.template;
	let changed = adopted.changed;
	const style: ThemeStyle = { ...(template.style as ThemeStyle) };
	if (palette) {
		Object.assign(style, { color: palette.text, muted: palette.muted, accent: palette.accent, onAccent: palette.onAccent, soft: palette.soft, dark: palette.dark, line: palette.line, palette: palette.key });
	}
	if (pairing) Object.assign(style, { font: pairing.font, heading: pairing.heading, pairing: pairing.key });
	// A template with no heading yet (older ones, hand-made): its big titles take the heading font.
	let headed = template;
	if (pairing && !usesHeading(template)) {
		headed = mapParts(template, b => {
			if (b.type === 'text' && !b.font && (b.size ?? 0) >= 15) {
				b.font = 'heading';
				changed++;
			}
			return b;
		});
	}
	return { template: { ...headed, style }, adopted: changed };
};

/** The style's colours as a palette-shaped object (to compare with the presets). */
export const paletteMatches = (s: ThemeStyle, p: Palette) => {
	const r = roleColors(s);
	return ROLES.every(k => r[k].toLowerCase() === p[k].toLowerCase());
};
