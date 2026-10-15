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

/* Typed Contents (docs/cms D1, CMS-06b): one record per section, words bound by path. */
import { typeInfos } from '../connect';
import { CONTENT_TYPES, typeUid } from '../contentTypes';

const TYPES = typeInfos(CONTENT_TYPES.map(t => ({ uid: typeUid(t.name), fields: t.fields })));
const valueAt = (obj: any, path: string) => path.split('.').reduce((v: any, k) => (v == null ? v : v[k]), obj);

describe('connectTree, typed', () => {
	it('connects every preset into a valid tree, each binding a path to a word in its typed record', () => {
		for (const p of loadManifest().presets as any[]) {
			const tree = presetTree(p.key);
			const { records } = connectTree(tree, { pageKey: p.category === 'header' ? 'header' : p.category === 'footer' ? 'footer' : 'home', pageName: 'Home', slugs: 'count', types: TYPES });
			expect({ preset: p.key, errors: errors(tree) }).toEqual({ preset: p.key, errors: [] });
			const bySlug = new Map(records.map(r => [r.slug, r]));
			for (const r of records) expect(r.type).toMatch(/^content\./);
			walk(tree, (n, inList) => {
				for (const b of Object.values<any>(n.bind || {}))
					if (b.from === 'content') {
						const r: any = bySlug.get(b.slug);
						expect({ preset: p.key, slug: b.slug, found: !!r }).toEqual({ preset: p.key, slug: b.slug, found: true });
						expect({ preset: p.key, field: b.field, set: valueAt(r.block[0], b.field) !== undefined }).toEqual({ preset: p.key, field: b.field, set: true });
					}
				if (!inList && n.type === 'heading' && !n.props.text.includes('{{')) expect(n.bind?.text?.from).toBe('content');
			});
			if (p.key.startsWith('hero')) expect(records[0].type).toBe('content.hero');
		}
	});

	it('a grid of cards becomes the section record’s rows, drawn by a list', () => {
		const tree = presetTree('team');
		const { records } = connectTree(tree, { pageKey: 'about', pageName: 'About', slugs: 'count', types: TYPES });
		const lists: any[] = [];
		walk(tree, n => n.type === 'collection' && lists.push(n));
		const rec: any = records.find(r => r.slug === lists[0]?.props.source.content);
		expect(rec?.type).toBe('content.cards');
		expect(rec.block[0].items.length).toBeGreaterThanOrEqual(3);
	});

	it('questions bind to rows by number', () => {
		const tree = presetTree('faq');
		const { records } = connectTree(tree, { pageKey: 'home', pageName: 'Home', slugs: 'count', types: TYPES });
		const faq: any = records.find(r => r.type === 'content.faq');
		expect(faq.block[0].items.length).toBeGreaterThanOrEqual(2);
		const paths: string[] = [];
		walk(tree, n => Object.values<any>(n.bind || {}).forEach(b => b.from === 'content' && paths.push(b.field)));
		expect(paths).toEqual(expect.arrayContaining(['items.0.title', 'items.0.description', 'items.1.title']));
	});
});

