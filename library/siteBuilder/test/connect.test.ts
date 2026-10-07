import { connectTree } from '../connect';
import { loadManifest, presetTree } from '../manifest';
import { validateTree } from '../validate';

const errors = (tree: any[]) => validateTree(tree).problems.filter(p => p.level === 'error').map(p => p.message);

const walk = (nodes: any[], fn: (n: any, inList: boolean) => void, inList = false) =>
	(nodes || []).forEach(n => {
		fn(n, inList);
		walk(n.children, fn, inList || n.type === 'collection');
	});

describe('connectTree', () => {
	it('connects every preset into a valid tree: words outside lists bound to Contents', () => {
		for (const p of loadManifest().presets as any[]) {
			const tree = presetTree(p.key);
			const { records } = connectTree(tree, { pageKey: 'home', pageName: 'Home', slugs: 'count', cards: true });
			expect({ preset: p.key, errors: errors(tree) }).toEqual({ preset: p.key, errors: [] });
			const slugs = new Set(records.map(r => r.slug));
			walk(tree, (n, inList) => {
				for (const b of Object.values<any>(n.bind || {})) if (b.from === 'content') expect(slugs.has(b.slug)).toBe(true);
				if (!inList && n.type === 'heading' && !n.props.text.includes('{{')) expect(n.bind?.text?.from).toBe('content');
			});
		}
	});

	it('turns a grid of look-alike cards into a list of cards in one record', () => {
		const tree = presetTree('team');
		const { records } = connectTree(tree, { pageKey: 'about', pageName: 'About', slugs: 'count', cards: true });
		const card = records.find(r => r.category === 'card');
		expect(card?.card).toHaveLength(4);
		expect(card?.card[0]).toEqual(expect.objectContaining({ title: expect.any(String) }));
		let list: any;
		walk(tree, n => n.type === 'collection' && (list = n));
		expect(list.props.source).toEqual({ content: card!.slug });
		expect(JSON.stringify(list.children)).toContain('"from":"item"');
	});

	it('keeps cards as plain blocks when the Contents model can’t hold cards', () => {
		const tree = presetTree('team');
		connectTree(tree, { pageKey: 'about', pageName: 'About', cards: false });
		let lists = 0;
		walk(tree, n => n.type === 'collection' && lists++);
		expect(lists).toBe(0);
	});

	it('gives new blocks demo words — lorem ipsum for rich text — and an empty list three demo cards', () => {
		const nodes = [
			{ id: 'aaaa0001', type: 'heading', props: { text: 'Heading', level: 2 } },
			{ id: 'aaaa0002', type: 'text', props: { html: '<p>Write something here.</p>' } },
			{ id: 'aaaa0003', type: 'collection', props: { source: { model: '' } }, children: [] },
		];
		const { records } = connectTree(nodes, { pageKey: 'home', pageName: 'Home', cards: true });
		expect(nodes[0].props.text).toMatch(/^Lorem ipsum/);
		expect((nodes[1].props as any).html).toContain('Lorem ipsum dolor sit amet');
		expect((nodes[2].props as any).source.content).toMatch(/^home-collection-/);
		expect(records.find(r => r.category === 'card')?.card).toHaveLength(3);
	});

	it('gives a copy (fresh) its own records, and leaves words already bound alone otherwise', () => {
		const bound = [{ id: 'bbbb0001', type: 'heading', props: { text: 'Hi', level: 2 }, bind: { text: { from: 'content', slug: 'home-hero-1', field: 'content' } } }];
		expect(connectTree(JSON.parse(JSON.stringify(bound)), { pageKey: 'home', pageName: 'Home' }).records).toHaveLength(0);
		const copy = JSON.parse(JSON.stringify(bound));
		const out = connectTree(copy, { pageKey: 'home', pageName: 'Home', fresh: true });
		expect(out.records).toHaveLength(1);
		expect(copy[0].bind.text.slug).not.toBe('home-hero-1');
	});
});
