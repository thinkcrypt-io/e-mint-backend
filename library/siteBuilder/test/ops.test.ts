import { applyOps, OpsError, splitOps } from '../ops';
import { newId, rekeyTree } from '../ids';

const tree = () => [
	{
		id: 'sect0001',
		type: 'section',
		props: {},
		children: [
			{ id: 'head0001', type: 'heading', props: { text: 'Hi', level: 1 } },
			{ id: 'text0001', type: 'text', props: { html: '<p>a</p>' } },
			{ id: 'butn0001', type: 'button', props: { label: 'Go' }, locked: true },
		],
	},
	{ id: 'sect0002', type: 'section', props: {}, children: [] },
];
const ids = (nodes: any[]): string[] => nodes.flatMap(n => [n.id, ...ids(n.children || [])]);
const fails = (fn: () => any, re: RegExp) => {
	let err: any;
	try {
		fn();
	} catch (e) {
		err = e;
	}
	expect(err).toBeInstanceOf(OpsError);
	expect(err.message).toMatch(re);
};

describe('applyOps', () => {
	it('inserts at the top level, into children and into a named slot, at an index', () => {
		const t = tree();
		const out = applyOps(t, [
			{ op: 'insert', parentId: null, index: 0, node: { id: 'new00001', type: 'section', props: {} } },
			{ op: 'insert', parentId: 'sect0001', index: 1, node: { id: 'new00002', type: 'text', props: {} } },
			{ op: 'insert', parentId: 'sect0002', slot: 'media', node: { id: 'new00003', type: 'image', props: {} } },
		]);
		expect(out.map(n => n.id)).toEqual(['new00001', 'sect0001', 'sect0002']);
		expect(out[1].children.map((n: any) => n.id)).toEqual(['head0001', 'new00002', 'text0001', 'butn0001']);
		expect(out[2].slots.media[0].id).toBe('new00003');
		expect(t[0].children).toHaveLength(3); // the input is untouched
	});

	it('updates: props and bind merge (null removes), style/hidden/action replace, name and locked', () => {
		const out = applyOps(tree(), [
			{ op: 'update', id: 'head0001', props: { text: 'Hello', level: null }, style: { base: { color: 'primary' } }, name: 'Title', hidden: { md: true } },
			{ op: 'update', id: 'butn0001', action: { type: 'link', href: '/x' }, bind: { label: { from: 'site', field: 'name' } }, locked: false },
		]);
		const h = out[0].children[0];
		expect(h).toEqual({ id: 'head0001', type: 'heading', name: 'Title', props: { text: 'Hello' }, style: { base: { color: 'primary' } }, hidden: { md: true } });
		const b = out[0].children[2];
		expect(b.action).toEqual({ type: 'link', href: '/x' });
		expect(b.locked).toBe(false);
		const cleared = applyOps(out, [{ op: 'update', id: 'butn0001', action: null, bind: { label: null }, name: null }]);
		expect(cleared[0].children[2].action).toBeUndefined();
		expect(cleared[0].children[2].bind).toBeUndefined();
	});

	it('moves within a list, across parents and to the top level', () => {
		let out = applyOps(tree(), [{ op: 'move', id: 'head0001', parentId: 'sect0001', index: 2 }]);
		expect(out[0].children.map((n: any) => n.id)).toEqual(['text0001', 'head0001', 'butn0001']);
		out = applyOps(out, [{ op: 'move', id: 'text0001', parentId: 'sect0002' }]);
		expect(out[1].children.map((n: any) => n.id)).toEqual(['text0001']);
		out = applyOps(out, [{ op: 'move', id: 'text0001', parentId: null, index: 0 }]);
		expect(out.map(n => n.id)).toEqual(['text0001', 'sect0001', 'sect0002']);
	});

	it('removes and wraps siblings in order', () => {
		let out = applyOps(tree(), [{ op: 'remove', id: 'text0001' }]);
		expect(ids(out)).not.toContain('text0001');
		out = applyOps(tree(), [{ op: 'wrap', ids: ['text0001', 'head0001'], node: { id: 'wrap0001', type: 'stack', props: {} } }]);
		expect(out[0].children.map((n: any) => n.id)).toEqual(['wrap0001', 'butn0001']);
		expect(out[0].children[0].children.map((n: any) => n.id)).toEqual(['head0001', 'text0001']);
	});

	it('refuses ops that cannot apply, and changes nothing', () => {
		const t = tree();
		fails(() => applyOps(t, [{ op: 'remove', id: 'nope0000' }]), /Change 1: there is no block/);
		fails(() => applyOps(t, [{ op: 'remove', id: 'text0001' }, { op: 'remove', id: 'butn0001' }]), /Change 2: .*locked/);
		fails(() => applyOps(t, [{ op: 'move', id: 'butn0001', parentId: null }]), /locked/);
		fails(() => applyOps(t, [{ op: 'move', id: 'sect0001', parentId: 'head0001' }]), /inside itself/);
		fails(() => applyOps(t, [{ op: 'insert', parentId: null, node: { id: 'head0001', type: 'heading', props: {} } }]), /already on the page/);
		fails(() => applyOps(t, [{ op: 'insert', parentId: 'nope0000', node: { id: 'x0000001', type: 'text', props: {} } }]), /no block “nope0000”/);
		fails(() => applyOps(t, [{ op: 'insert', parentId: null, node: null }]), /missing/);
		fails(() => applyOps(t, [{ op: 'update', id: 'head0001', type: 'text' } as any]), /“type” can’t be changed/);
		fails(() => applyOps(t, [{ op: 'wrap', ids: ['head0001', 'sect0002'], node: { id: 'wrap0001', type: 'stack', props: {} } }]), /side by side/);
		fails(() => applyOps(t, [{ op: 'explode' } as any]), /no change “explode”/);
		fails(() => applyOps(t, [{ op: 'setDesign', theme: 'x' }]), /design/);
		expect(t).toEqual(tree());
	});

	it('splits design ops from tree ops', () => {
		const { tree: t, design } = splitOps([{ op: 'remove', id: 'a' }, { op: 'setDesign', theme: 'studio' }]);
		expect(t).toHaveLength(1);
		expect(design).toEqual([{ op: 'setDesign', theme: 'studio' }]);
	});
});

describe('rekeyTree', () => {
	it('gives every node a new id and keeps actions pointing inside the copy', () => {
		const src = [
			{ id: 'btn00001', type: 'button', props: {}, action: { type: 'open', target: 'modal001' } },
			{ id: 'lnk00001', type: 'link', props: {}, action: { type: 'link', href: '#node:modal001' } },
			{ id: 'out00001', type: 'link', props: {}, action: { type: 'scroll', target: 'elsewhere' } },
			{ id: 'modal001', type: 'section', props: {}, children: [{ id: 'txt00001', type: 'text', props: {} }] },
		];
		const out = rekeyTree(src);
		const fresh = ids(out);
		expect(new Set(fresh).size).toBe(5);
		expect(fresh.some(id => ids(src).includes(id))).toBe(false);
		expect(out[0].action.target).toBe(out[3].id);
		expect(out[1].action.href).toBe(`#node:${out[3].id}`);
		expect(out[2].action.target).toBe('elsewhere');
		expect(newId()).toMatch(/^[A-Za-z0-9_-]{8}$/);
	});
});
