import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import sharp from 'sharp';

/**
 * Images a template prints — a logo, a signature, a product photo (docs/
 * pdf-templates D10). Templates and records hold their addresses, so the
 * server fetches them carefully: http(s) only, the address the name resolves
 * to is checked when the connection is made (so a name can't swap to an
 * inside address after the check), cloud-metadata addresses never, private
 * ones only outside production; 5 s, 5 MB. PNG and JPEG go in as they are;
 * WebP, GIF, AVIF and SVG are turned into PNG. Anything else prints nothing.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

const allowPrivate = () => process.env.NODE_ENV !== 'production' || process.env.PDF_IMAGES_ALLOW_PRIVATE === '1';

const v4 = (ip: string) => ip.split('.').map(Number);
const isLinkLocal = (ip: string): boolean => {
	if (net.isIPv4(ip)) return v4(ip)[0] === 169 && v4(ip)[1] === 254;
	const low = ip.toLowerCase();
	if (low.startsWith('::ffff:')) return isLinkLocal(low.slice(7));
	return /^fe[89ab]/.test(low);
};
const isPrivate = (ip: string): boolean => {
	if (net.isIPv4(ip)) {
		const [a, b] = v4(ip);
		return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
	}
	const low = ip.toLowerCase();
	if (low.startsWith('::ffff:')) return isPrivate(low.slice(7));
	return low === '::' || low === '::1' || /^f[cd]/.test(low) || /^ff/.test(low);
};
const refused = (ip: string) => isLinkLocal(ip) || (!allowPrivate() && isPrivate(ip));

/** dns.lookup that refuses addresses an image may not come from — checked as the socket connects. */
const safeLookup: any = (host: string, options: any, cb: any) => {
	dns.lookup(host, { ...options, all: true }, (err: any, addresses: any) => {
		if (err) return cb(err);
		const list = (Array.isArray(addresses) ? addresses : [{ address: addresses, family: options?.family || 4 }]) as { address: string; family: number }[];
		if (!list.length || list.some(a => refused(a.address))) return cb(new Error('refused address'));
		if (options?.all) return cb(null, list);
		cb(null, list[0].address, list[0].family);
	});
};

const get = (url: string, redirects = 0): Promise<Buffer | null> =>
	new Promise(resolve => {
		let u: URL;
		try {
			u = new URL(url);
		} catch {
			return resolve(null);
		}
		if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return resolve(null);
		const host = u.hostname.replace(/^\[|\]$/g, '');
		if (net.isIP(host) && refused(host)) return resolve(null);
		const lib = u.protocol === 'https:' ? https : http;
		const req = lib.get(u, { lookup: safeLookup, timeout: TIMEOUT_MS, headers: { accept: 'image/*', 'user-agent': 'mint-pdf/1' } }, res => {
			const status = res.statusCode || 0;
			if (status >= 300 && status < 400 && res.headers.location && redirects < MAX_REDIRECTS) {
				res.resume();
				return resolve(get(new URL(res.headers.location, u).toString(), redirects + 1));
			}
			if (status !== 200 || Number(res.headers['content-length'] || 0) > MAX_BYTES) {
				res.resume();
				return resolve(null);
			}
			const chunks: Buffer[] = [];
			let size = 0;
			res.on('data', (c: Buffer) => {
				size += c.length;
				if (size > MAX_BYTES) {
					req.destroy();
					resolve(null);
				} else chunks.push(c);
			});
			res.on('end', () => resolve(Buffer.concat(chunks)));
			res.on('error', () => resolve(null));
		});
		req.on('timeout', () => req.destroy());
		req.on('error', () => resolve(null));
	});

const isPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const looksSvg = (b: Buffer) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(b.subarray(0, 1024).toString('utf8'));

/** PNG / JPEG as they are; other images as PNG; anything else null. */
const usable = async (b: Buffer | null): Promise<Buffer | null> => {
	if (!b || !b.length) return null;
	if (isPng(b) || isJpeg(b)) return b;
	try {
		if (looksSvg(b)) {
			// Never let an SVG reach out for anything it links to.
			if (/(xlink:)?href\s*=\s*["'](?!#|data:)/i.test(b.toString('utf8'))) return null;
			return await sharp(b, { density: 220 }).png().toBuffer();
		}
		return await sharp(b, { animated: false }).png().toBuffer();
	} catch {
		return null;
	}
};

const DATA_URL = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=\s]+)$/;

/**
 * Fetches every image a render needs, once each. Per render — a changed logo
 * shows on the next download.
 */
export class ImageLoader {
	private cache = new Map<string, Promise<Buffer | null>>();

	load(src: string): Promise<Buffer | null> {
		const key = (src || '').trim();
		if (!key) return Promise.resolve(null);
		let hit = this.cache.get(key);
		if (!hit) {
			if (this.cache.size >= 60) return Promise.resolve(null);
			const data = DATA_URL.exec(key);
			hit = data ? usable(Buffer.from(data[1], 'base64')).catch(() => null) : get(key).then(usable).catch(() => null);
			this.cache.set(key, hit);
		}
		return hit;
	}

	/** Already fetched (render time is synchronous). */
	async ready(): Promise<Map<string, Buffer | null>> {
		const out = new Map<string, Buffer | null>();
		for (const [k, p] of this.cache) out.set(k, await p);
		return out;
	}
}
