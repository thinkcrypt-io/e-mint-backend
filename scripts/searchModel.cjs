/**
 * The search-by-meaning model (docs/search SI-19, README SI23): fetched once at BUILD time into search-model/ (gitignored —
 * too big for git), never at run time. Pinned to one revision; each file's size is checked.
 *
 *   node scripts/searchModel.cjs            fetch what's missing (Heroku runs it from heroku-postbuild)
 *   node scripts/searchModel.cjs --check    say whether the model is there (exit 1 if not)
 *   node scripts/searchModel.cjs --prune    also, on Linux only, delete onnxruntime-node's Windows / macOS binaries
 *                                          (about 200 MB of the slug)
 *
 * SEARCH_SEMANTIC=off skips the fetch (and search runs without meaning).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const REVISION = '2c4055b12046f11709e9df2c122e59ffbdc2f900';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'];
const ROOT = path.join(__dirname, '..', 'search-model');
const DIR = path.join(ROOT, REPO);

const get = (url, out, hops = 0) =>
	new Promise((resolve, reject) => {
		https
			.get(url, { headers: { 'user-agent': 'mint-search-build' } }, res => {
				if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
					res.resume();
					return resolve(get(new URL(res.headers.location, url).toString(), out, hops + 1));
				}
				if (res.statusCode !== 200) {
					res.resume();
					return reject(new Error(`${url}: HTTP ${res.statusCode}`));
				}
				const tmp = `${out}.part`;
				const file = fs.createWriteStream(tmp);
				res.pipe(file);
				file.on('finish', () => file.close(() => (fs.renameSync(tmp, out), resolve())));
				file.on('error', reject);
			})
			.on('error', reject);
	});

const have = () => FILES.every(f => fs.existsSync(path.join(DIR, f)) && fs.statSync(path.join(DIR, f)).size > 0);

const prune = () => {
	if (process.platform !== 'linux') return console.log('search model: --prune only runs on Linux');
	const bin = path.join(__dirname, '..', 'node_modules', 'onnxruntime-node', 'bin');
	if (!fs.existsSync(bin)) return;
	for (const napi of fs.readdirSync(bin)) for (const os of ['win32', 'darwin']) {
		const p = path.join(bin, napi, os);
		if (fs.existsSync(p)) (fs.rmSync(p, { recursive: true, force: true }), console.log(`search model: removed ${path.relative(process.cwd(), p)}`));
	}
};

(async () => {
	const args = process.argv.slice(2);
	if (args.includes('--check')) {
		console.log(have() ? `search model: ready in ${path.relative(process.cwd(), DIR)}` : 'search model: missing — run node scripts/searchModel.cjs');
		process.exit(have() ? 0 : 1);
	}
	if (args.includes('--prune')) prune();
	if (process.env.SEARCH_SEMANTIC === 'off') return console.log('search model: SEARCH_SEMANTIC=off, not fetched');
	for (const f of FILES) {
		const out = path.join(DIR, f);
		if (fs.existsSync(out) && fs.statSync(out).size > 0) continue;
		fs.mkdirSync(path.dirname(out), { recursive: true });
		const t = Date.now();
		await get(`https://huggingface.co/${REPO}/resolve/${REVISION}/${f}`, out);
		console.log(`search model: ${f} ${(fs.statSync(out).size / 1e6).toFixed(1)} MB in ${((Date.now() - t) / 1000).toFixed(1)} s`);
	}
	console.log(`search model: ready (${REPO}@${REVISION.slice(0, 7)})`);
})().catch(e => {
	// A failed fetch never fails the build: search runs without meaning and says so in /commerce/search/status.
	console.error(`search model: not fetched — ${e.message}. Search will run without meaning.`);
	process.exit(0);
});
