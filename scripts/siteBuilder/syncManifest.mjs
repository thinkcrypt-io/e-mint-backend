// Copies the renderer's block manifest into the backend (docs/site-builder D5):
//   node scripts/siteBuilder/syncManifest.mjs [path to mint-sites]
// The backend validates every page against this copy and serves it to the
// editor and the AI, so re-run it whenever mint-sites changes its blocks
// (after `npm run manifest` there) and commit the result.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sites = path.resolve(process.argv[2] || path.join(here, '../../../mint-sites'));
const from = path.join(sites, 'block-manifest.json');
const to = path.join(here, '../../library/siteBuilder/blockManifest.json');

const manifest = JSON.parse(fs.readFileSync(from, 'utf8'));
if (!manifest.version || !Array.isArray(manifest.blocks)) throw new Error(`${from} is not a block manifest`);
const before = fs.existsSync(to) ? JSON.parse(fs.readFileSync(to, 'utf8')).version : null;
fs.writeFileSync(to, JSON.stringify(manifest, null, '\t') + '\n');
console.log(`block manifest ${before === manifest.version ? 'unchanged' : `${before || 'none'} → ${manifest.version}`}: ${manifest.blocks.length} blocks, ${manifest.presets.length} presets, ${manifest.themes.length} theme(s)`);
