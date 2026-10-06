/**
 * Edits to a page tree as operations (docs/site-builder D15): what the
 * editor's paste (SB-06), the AI (SB-11) and the MCP (SB-12) send. Each op
 * works on a copy; one that can't apply throws OpsError naming it, and nothing
 * is changed. The result still goes through validateTree before it's saved.
 *
 *   { op: 'insert', parentId: id | null, slot?, index?, node }      null parent = top level
 *   { op: 'update', id, props?, style?, hidden?, bind?, name?, action?, locked? }
 *        props / bind merge (a null value removes the key); style, hidden replace; action null removes it
 *   { op: 'move',   id, parentId: id | null, slot?, index? }
 *   { op: 'remove', id }
 *   { op: 'wrap',   ids: [id, …] (siblings, in order), node }      the node (empty) takes their place and holds them
 *
 * `slot` is 'children' (default) or a named slot. Locked nodes can't be moved,
 * removed or wrapped. `setDesign` ops belong to the design (splitOps).
 */

import { NODE_ID } from './ids.js';

export class OpsError extends Error {
	status = 400;
	index: number;
	constructor(index: number, message: string) {
		super(`Change ${index + 1}: ${message}`);
		this.index = index;
	}
}

export type Op =
	| { op: 'insert'; parentId: string | null; slot?: string; index?: number; node: any }
	| { op: 'update'; id: string; props?: Record<string, any>; style?: any; hidden?: any; bind?: Record<string, any>; name?: string | null; action?: any; locked?: boolean }
	| { op: 'move'; id: string; parentId: string | null; slot?: string; index?: number }
	| { op: 'remove'; id: string }
	| { op: 'wrap'; ids: string[]; node: any }
	| { op: 'setDesign'; [k: string]: any };

const TREE_OPS = ['insert', 'update', 'move', 'remove', 'wrap'];
const MAX_OPS = 500;

/** Tree ops and design ops, apart. */
export const splitOps = (ops: Op[]) => ({
	tree: ops.filter(o => o?.op !== 'setDesign'),
	design: ops.filter(o => o?.op === 'setDesign'),
});

type Found = { node: any; list: any[]; index: number; parent: any | null };

const find = (nodes: any[], id: string, parent: any = null): Found | null => {
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i];
		if (n?.id === id) return { node: n, list: nodes, index: i, parent };
		for (const list of childLists(n)) {
			const hit = find(list, id, n);
			if (hit) return hit;
		}
	}
	return null;
};

const childLists = (n: any): any[][] => {
	if (!n || typeof n !== 'object') return [];
	const out: any[][] = [];
	if (Array.isArray(n.children)) out.push(n.children);
	if (n.slots && typeof n.slots === 'object') for (const v of Object.values<any>(n.slots)) if (Array.isArray(v)) out.push(v);
	return out;
};

const allIds = (nodes: any[], out = new Set<string>()) => {
	for (const n of nodes || []) {
		if (typeof n?.id === 'string') out.add(n.id);
		childLists(n).forEach(l => allIds(l, out));
	}
	return out;
};

const contains = (node: any, id: string): boolean => childLists(node).some(l => l.some(c => c?.id === id || contains(c, id)));

/** The list a parent's slot holds (created if missing). */
const slotList = (tree: any[], parentId: string | null, slot: string | undefined, i: number): any[] => {
	if (parentId === null || parentId === undefined) return tree;
	const hit = find(tree, parentId);
	if (!hit) throw new OpsError(i, `there is no block “${parentId}”`);
	const p = hit.node;
	const name = slot || 'children';
	if (name === 'children') return (p.children = Array.isArray(p.children) ? p.children : []);
	if (!/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(name)) throw new OpsError(i, `“${name}” isn’t a slot name`);
	p.slots = p.slots && typeof p.slots === 'object' ? p.slots : {};
	return (p.slots[name] = Array.isArray(p.slots[name]) ? p.slots[name] : []);
};

const at = (list: any[], index: number | undefined) =>
	index === undefined || index === null || !Number.isInteger(index) || index > list.length ? list.length : Math.max(0, index);

const checkNode = (node: any, i: number) => {
	if (!node || typeof node !== 'object' || Array.isArray(node)) throw new OpsError(i, 'the block to add is missing');
	if (typeof node.type !== 'string') throw new OpsError(i, 'the block to add has no type');
};

const merge = (into: any, patch: any) => {
	const out = { ...(into || {}) };
	for (const [k, v] of Object.entries<any>(patch || {})) {
		if (v === null) delete out[k];
		else out[k] = v;
	}
	return out;
};

/** `tree` with `ops` applied, as a new tree. Throws OpsError on the first op that can't apply. */
export const applyOps = (tree: any[], ops: Op[]): any[] => {
	if (!Array.isArray(ops)) throw new OpsError(0, 'changes must be a list');
	if (ops.length > MAX_OPS) throw new OpsError(MAX_OPS, `at most ${MAX_OPS} changes at once`);
	const out: any[] = JSON.parse(JSON.stringify(Array.isArray(tree) ? tree : []));

	ops.forEach((o: any, i) => {
		if (!o || typeof o !== 'object' || !TREE_OPS.includes(o.op))
			throw new OpsError(i, o?.op === 'setDesign' ? 'setDesign changes the design, not a page' : `there is no change “${String(o?.op).slice(0, 20)}”`);

		switch (o.op) {
			case 'insert': {
				checkNode(o.node, i);
				const ids = allIds(out);
				for (const id of allIds([o.node])) if (ids.has(id)) throw new OpsError(i, `a block with id “${id}” is already on the page`);
				const list = slotList(out, o.parentId ?? null, o.slot, i);
				list.splice(at(list, o.index), 0, JSON.parse(JSON.stringify(o.node)));
				break;
			}
			case 'update': {
				const hit = typeof o.id === 'string' ? find(out, o.id) : null;
				if (!hit) throw new OpsError(i, `there is no block “${o.id}”`);
				const n = hit.node;
				const UPDATABLE = ['op', 'id', 'props', 'style', 'hidden', 'bind', 'name', 'action', 'locked'];
				const extra = Object.keys(o).find(k => !UPDATABLE.includes(k));
				if (extra) throw new OpsError(i, `a block’s “${extra}” can’t be changed this way`);
				if (o.props !== undefined) n.props = merge(n.props, o.props);
				if (o.bind !== undefined) {
					n.bind = merge(n.bind, o.bind);
					if (!Object.keys(n.bind).length) delete n.bind;
				}
				for (const k of ['style', 'hidden', 'action'] as const)
					if (o[k] !== undefined) {
						if (o[k] === null) delete n[k];
						else n[k] = o[k];
					}
				if (o.name !== undefined) {
					if (o.name === null || o.name === '') delete n.name;
					else n.name = o.name;
				}
				if (o.locked !== undefined) n.locked = !!o.locked;
				break;
			}
			case 'move': {
				const hit = typeof o.id === 'string' ? find(out, o.id) : null;
				if (!hit) throw new OpsError(i, `there is no block “${o.id}”`);
				if (hit.node.locked) throw new OpsError(i, `“${hit.node.name || hit.node.id}” is locked`);
				if (o.parentId === o.id || (o.parentId && contains(hit.node, o.parentId))) throw new OpsError(i, 'a block can’t go inside itself');
				hit.list.splice(hit.index, 1);
				const list = slotList(out, o.parentId ?? null, o.slot, i);
				// Moving later within the same list: the index counts as if the block were still there.
				const index = list === hit.list && Number.isInteger(o.index) && o.index > hit.index ? o.index - 1 : o.index;
				list.splice(at(list, index), 0, hit.node);
				break;
			}
			case 'remove': {
				const hit = typeof o.id === 'string' ? find(out, o.id) : null;
				if (!hit) throw new OpsError(i, `there is no block “${o.id}”`);
				if (hit.node.locked) throw new OpsError(i, `“${hit.node.name || hit.node.id}” is locked`);
				hit.list.splice(hit.index, 1);
				break;
			}
			case 'wrap': {
				checkNode(o.node, i);
				if (!Array.isArray(o.ids) || !o.ids.length || o.ids.some((id: any) => typeof id !== 'string'))
					throw new OpsError(i, 'name the blocks to wrap');
				if (typeof o.node.id !== 'string' || !NODE_ID.test(o.node.id)) throw new OpsError(i, 'the wrapping block needs an id');
				if (allIds(out).has(o.node.id)) throw new OpsError(i, `a block with id “${o.node.id}” is already on the page`);
				const hits = o.ids.map((id: string) => find(out, id));
				if (hits.some((h: Found | null) => !h)) throw new OpsError(i, 'one of the blocks to wrap isn’t on the page');
				const list = hits[0]!.list;
				if (hits.some((h: Found) => h.list !== list)) throw new OpsError(i, 'only blocks side by side (in the same place) can be wrapped together');
				if (hits.some((h: Found) => h.node.locked)) throw new OpsError(i, 'a locked block can’t be wrapped');
				const indexes = hits.map((h: Found) => h.index).sort((a: number, b: number) => a - b);
				const wrapper = { ...JSON.parse(JSON.stringify(o.node)), children: indexes.map((x: number) => list[x]) };
				for (const x of [...indexes].reverse()) list.splice(x, 1);
				list.splice(indexes[0], 0, wrapper);
				break;
			}
		}
	});
	return out;
};
