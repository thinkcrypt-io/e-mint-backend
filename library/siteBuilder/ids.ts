import crypto from 'crypto';

/** Node ids: 8 characters of nanoid's alphabet (docs/site-builder "Node"). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
export const NODE_ID = /^[A-Za-z0-9_-]{4,32}$/;

export const newId = (): string => {
	const bytes = crypto.randomBytes(8);
	let id = '';
	for (let i = 0; i < 8; i++) id += ALPHABET[bytes[i] & 63];
	return id;
};

/**
 * A copy of `nodes` with fresh ids everywhere, and the actions inside it that
 * pointed at one of its own nodes (open / scroll targets, `#node:` links)
 * pointing at the new ids. Used for presets, paste and duplicate.
 */
export const rekeyTree = (nodes: any[], makeId: () => string = newId): any[] => {
	const map = new Map<string, string>();
	const assign = (list: any[] = []) =>
		list.forEach(n => {
			if (!n || typeof n !== 'object') return;
			if (typeof n.id === 'string') map.set(n.id, makeId());
			assign(n.children);
			if (n.slots && typeof n.slots === 'object') Object.values<any>(n.slots).forEach(assign);
		});
	assign(nodes);
	const fixAction = (a: any) => {
		if (!a || typeof a !== 'object') return a;
		if (typeof a.target === 'string' && map.has(a.target)) return { ...a, target: map.get(a.target) };
		if (a.type === 'link' && typeof a.href === 'string' && a.href.startsWith('#node:') && map.has(a.href.slice(6)))
			return { ...a, href: `#node:${map.get(a.href.slice(6))}` };
		return a;
	};
	const copy = (list: any[] = []): any[] =>
		list.map(n => {
			if (!n || typeof n !== 'object') return n;
			const out: any = { ...n, id: map.get(n.id) ?? makeId() };
			if (n.action) out.action = fixAction(n.action);
			if (Array.isArray(n.children)) out.children = copy(n.children);
			if (n.slots && typeof n.slots === 'object')
				out.slots = Object.fromEntries(Object.entries<any>(n.slots).map(([k, v]) => [k, copy(v)]));
			return out;
		});
	return copy(JSON.parse(JSON.stringify(nodes)));
};
