import fs from 'fs';
import path from 'path';
import { rekeyTree } from './ids.js';

/**
 * The block manifest (docs/site-builder D5): the renderer's description of its
 * blocks, presets, themes, token and style schemas, icons, embed hosts and
 * limits. A copy lives next to this file (blockManifest.json, synced from
 * mint-sites by scripts/siteBuilder/syncManifest.mjs); the validator, the
 * editor (GET …/site-builder/manifest) and the AI read it from here. Loaded
 * once — a new manifest needs a restart, which a deploy is anyway.
 */

export type PropDef = {
	key: string;
	label: string;
	kind: string;
	options?: { value: string | number; label: string }[];
	default?: any;
	help?: string;
	bindable?: boolean;
	min?: number;
	max?: number;
	fields?: PropDef[];
};

export type SlotDef = { label?: string; allow?: string[] };

export type BlockDef = {
	type: string;
	label: string;
	category: string;
	icon: string;
	description: string;
	aiHint: string;
	props: PropDef[];
	slots?: Record<string, SlotDef>;
	canBeChildOf?: string[];
	style: 'all' | string[];
	defaults: { props: Record<string, any>; style?: any; children?: any[] };
	client?: boolean;
	actions?: boolean;
};

export type StyleKeyDef = {
	group: string;
	kind: 'enum' | 'space' | 'color' | 'int' | 'length' | 'url' | 'gradient';
	values?: (string | number)[];
	min?: number;
	max?: number;
	also?: string[];
	units?: Record<string, number>;
	auto?: boolean;
};

export type Manifest = {
	version: string;
	blocks: BlockDef[];
	presets: { key: string; label: string; category: string; kinds?: string[]; themes?: string[]; thumbnail: string; tree: any[] }[];
	themes: { key: string; label: string; description: string; tokens: any; preview: any }[];
	tokens: Record<string, any>;
	style: Record<string, StyleKeyDef>;
	icons: string[];
	embeds: string[];
	limits: { maxNodes: number; maxDepth: number; maxBytes: number };
};

export type LoadedManifest = Manifest & {
	byType: Map<string, BlockDef>;
	propsOf: Map<string, Map<string, PropDef>>;
	iconSet: Set<string>;
	themeKeys: Set<string>;
};

// tsc doesn't copy JSON into dist/, so read it from the source folder: the
// backend runs from its root (`node dist/server.js`), the tests from there too.
const CANDIDATES = [
	process.env.SITE_MANIFEST_PATH || '',
	path.join(process.cwd(), 'library/siteBuilder/blockManifest.json'),
	path.join(process.cwd(), 'backend/library/siteBuilder/blockManifest.json'),
].filter(Boolean);

let loaded: LoadedManifest | null = null;

export const loadManifest = (): LoadedManifest => {
	if (loaded) return loaded;
	const file = CANDIDATES.find(f => fs.existsSync(f));
	if (!file) throw new Error('Site builder: blockManifest.json not found (run scripts/siteBuilder/syncManifest.mjs)');
	const m: Manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
	loaded = {
		...m,
		byType: new Map(m.blocks.map(b => [b.type, b])),
		propsOf: new Map(m.blocks.map(b => [b.type, new Map(b.props.map(p => [p.key, p]))])),
		iconSet: new Set(m.icons),
		themeKeys: new Set(m.themes.map(t => t.key)),
	};
	return loaded;
};

/** The manifest as the editor and the AI get it (no lookup maps). */
export const publicManifest = (): Manifest => {
	const { byType, propsOf, iconSet, themeKeys, ...m } = loadManifest();
	return m;
};

export const manifestVersion = () => loadManifest().version;

export const DEFAULT_THEME = 'studio';

/** A preset's tree with fresh ids (presets ship with fixed ones). */
export const presetTree = (key: string): any[] => {
	const preset = loadManifest().presets.find(p => p.key === key);
	return preset ? rekeyTree(preset.tree) : [];
};
