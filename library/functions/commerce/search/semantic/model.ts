/**
 * Store search by meaning — the model (docs/search SI-19, README SI23). A small multilingual sentence model
 * (paraphrase-multilingual-MiniLM-L12-v2, quantised ONNX, ~120 MB) fetched at build time into `search-model/` by
 * scripts/searchModel.cjs, never at run time and never from an AI service. It runs in ONE worker thread, so a text
 * being turned into numbers never holds up a request.
 *
 * Loaded lazily: the first text asked for starts it (~5 s). Until it's ready a query gets no vector and search goes
 * on by words alone. A query that waits longer than its budget (150 ms) is let go the same way, and counted.
 *
 *   SEARCH_SEMANTIC=off      never loads (and the build doesn't fetch it)
 *   SEARCH_MODEL_DIR         where the model is (default: search-model/ in the backend's folder)
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Worker } from 'worker_threads';
import { DIMS } from './vector.js';

export const MODEL_REPO = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const FILE = 'onnx/model_quantized.onnx';
export const QUERY_BUDGET_MS = () => Number(process.env.SEARCH_SEMANTIC_MS) || 150;

const dir = () => process.env.SEARCH_MODEL_DIR || path.resolve(process.cwd(), 'search-model');
const switchedOff = () => process.env.SEARCH_SEMANTIC === 'off';
const present = () => {
	try {
		return fs.statSync(path.join(dir(), MODEL_REPO, FILE)).size > 1e6;
	} catch {
		return false;
	}
};

type State = 'off' | 'missing' | 'idle' | 'loading' | 'ready' | 'failed';
const m = {
	state: 'idle' as State,
	worker: null as Worker | null,
	ready: null as Promise<boolean> | null,
	loadMs: 0,
	error: '',
	next: 1,
	waiting: new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>(),
	queries: 0,
	slow: 0,
	queryMs: [] as number[],
	embedded: 0,
};

// The worker is plain JavaScript (an eval worker), so it needs no file of its own next to the compiled code.
const WORKER = `
const { parentPort, workerData } = require('worker_threads');
(async () => {
	let pipe;
	try {
		const t = require(workerData.lib);
		t.env.allowRemoteModels = false;
		t.env.allowLocalModels = true;
		t.env.localModelPath = workerData.dir + '/';
		t.env.cacheDir = workerData.dir;
		pipe = await t.pipeline('feature-extraction', workerData.repo, { dtype: 'q8' });
		await pipe(['warm up'], { pooling: 'mean', normalize: true });
	} catch (e) {
		parentPort.postMessage({ failed: String((e && e.message) || e) });
		return;
	}
	parentPort.postMessage({ ready: true });
	parentPort.on('message', async msg => {
		try {
			const out = await pipe(msg.texts, { pooling: 'mean', normalize: true });
			const data = Float32Array.from(out.data);
			parentPort.postMessage({ id: msg.id, data }, [data.buffer]);
		} catch (e) {
			parentPort.postMessage({ id: msg.id, error: String((e && e.message) || e) });
		}
	});
})();
`;

const fail = (why: string) => {
	m.state = 'failed';
	m.error = why;
	for (const w of m.waiting.values()) w.reject(new Error(why));
	m.waiting.clear();
	console.error(`search by meaning: off — ${why}`);
};

/** Starts the model (once). Resolves true when it's ready, false when it can't run here. */
export const startModel = (): Promise<boolean> => {
	if (m.ready) return m.ready;
	if (switchedOff()) return ((m.state = 'off'), (m.ready = Promise.resolve(false)));
	if (!present()) return ((m.state = 'missing'), (m.ready = Promise.resolve(false)));
	m.state = 'loading';
	const started = Date.now();
	m.ready = new Promise<boolean>(resolve => {
		let lib: string;
		try {
			lib = createRequire(path.join(process.cwd(), 'package.json')).resolve('@huggingface/transformers');
		} catch (e: any) {
			fail(`@huggingface/transformers isn't installed (${e?.message})`);
			return resolve(false);
		}
		const w = new Worker(WORKER, { eval: true, workerData: { lib, dir: dir(), repo: MODEL_REPO } });
		w.unref();
		m.worker = w;
		w.on('message', (msg: any) => {
			if (msg.ready) {
				m.state = 'ready';
				m.loadMs = Date.now() - started;
				console.log(`search by meaning: model ready in ${m.loadMs} ms`);
				return resolve(true);
			}
			if (msg.failed) return fail(msg.failed), resolve(false);
			const job = m.waiting.get(msg.id);
			if (!job) return;
			m.waiting.delete(msg.id);
			if (msg.error) return job.reject(new Error(msg.error));
			const data: Float32Array = msg.data;
			const out: Float32Array[] = [];
			for (let i = 0; i < data.length / DIMS; i++) out.push(data.subarray(i * DIMS, (i + 1) * DIMS));
			job.resolve(out);
		});
		w.on('error', e => (fail(e?.message || String(e)), resolve(false)));
		w.on('exit', code => {
			if (m.state === 'ready' || m.state === 'loading') fail(`the model's worker stopped (${code})`);
			m.worker = null;
			resolve(false);
		});
	});
	return m.ready;
};

const run = (texts: string[]) =>
	new Promise<Float32Array[]>((resolve, reject) => {
		const id = m.next++;
		m.waiting.set(id, { resolve, reject });
		m.worker!.postMessage({ id, texts });
	});

/** Texts → vectors, waiting for the model to load (the indexer). null when it can't run here. */
export const embedTexts = async (texts: string[]): Promise<Float32Array[] | null> => {
	if (!texts.length) return [];
	if (!(await startModel()) || !m.worker) return null;
	const out = await run(texts);
	m.embedded += texts.length;
	return out;
};

/**
 * A shopper's query → its vector, within the budget; else null (search goes on by words). The first one starts the
 * model and gets null: a query never waits for the model to load.
 */
export const embedQuery = async (text: string): Promise<Float32Array | null> => {
	if (m.state !== 'ready') {
		startModel();
		return null;
	}
	m.queries++;
	const started = Date.now();
	let timer: any;
	const late = new Promise<null>(r => (timer = setTimeout(() => r(null), QUERY_BUDGET_MS())));
	const v = await Promise.race([run([text]).then(x => x[0]).catch(() => null), late]);
	clearTimeout(timer);
	const ms = Date.now() - started;
	m.queryMs.push(ms);
	if (m.queryMs.length > 200) m.queryMs.shift();
	if (!v) {
		m.slow++;
		console.warn(`search by meaning: a query took over ${QUERY_BUDGET_MS()} ms — searched by words only`);
	}
	return v;
};

/** Whether the platform has it at all (the switch, the model file). */
export const meaningAvailable = () => !switchedOff() && present();

/** For the status card and the settings: where the model is. */
export const meaningState = () => {
	const state: State = switchedOff() ? 'off' : m.state === 'idle' && !present() ? 'missing' : m.state;
	const sorted = [...m.queryMs].sort((a, b) => a - b);
	const p = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);
	return {
		state,
		...(m.loadMs && { loadMs: m.loadMs }),
		...(m.error && { error: m.error }),
		queries: m.queries,
		slow: m.slow,
		p50: p(0.5),
		p95: p(0.95),
		embedded: m.embedded,
	};
};

/** Tests only: forget the model (a fresh start next time). */
export const resetModelForTests = async () => {
	await m.worker?.terminate();
	Object.assign(m, { state: 'idle', worker: null, ready: null, loadMs: 0, error: '', queries: 0, slow: 0, queryMs: [], embedded: 0 });
};
