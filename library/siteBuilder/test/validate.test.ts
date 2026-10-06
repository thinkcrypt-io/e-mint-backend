import { validateDesign, validatePageFields, validateTree } from '../validate';

const errors = (r: { problems: any[] }) => r.problems.filter(p => p.level === 'error').map(p => p.message);

describe('validateTree', () => {
	it('accepts a well-formed tree', () => {
		const r = validateTree([
			{
				id: 'sect0001',
				type: 'section',
				props: { width: 'narrow', paddingY: 'lg' },
				style: { base: { bgColor: 'muted', paddingTop: 8 }, md: { gradient: { from: 'primary', to: 'accent', angle: 90 } } },
				children: [
					{ id: 'head0001', type: 'heading', props: { text: 'Hi', level: 1 }, hidden: { base: false, lg: true } },
					{ id: 'butn0001', type: 'button', props: { label: 'Go', icon: 'arrow-right' }, action: { type: 'scroll', target: 'sect0001' } },
					{ id: 'imag0001', type: 'image', props: { src: 'placeholder:800x600:Hero' }, bind: { alt: { from: 'site', field: 'identity.siteName' } } },
				],
			},
		]);
		expect(r.problems).toEqual([]);
		expect(r.ok).toBe(true);
	});

	it('finds a bad type, a javascript: link, duplicate ids and unknown props', () => {
		const r = validateTree([
			{ id: 'aaaa0001', type: 'marquee-of-doom', props: {} },
			{ id: 'aaaa0002', type: 'button', props: { label: 'x' }, action: { type: 'link', href: 'javascript:alert(1)' } },
			{ id: 'aaaa0002', type: 'heading', props: { text: 'x', colour: 'red', level: 9 } },
			{ id: 'aaaa0003', type: 'text', props: { html: 1 }, onclick: 'x' },
		]);
		const msgs = errors(r);
		expect(r.ok).toBe(false);
		expect(msgs).toEqual(
			expect.arrayContaining([
				'There is no block type “marquee-of-doom”',
				expect.stringMatching(/never javascript/),
				'Two blocks have the id “aaaa0002”',
				'Heading has no setting “colour”',
				expect.stringMatching(/Level: “9” isn’t one of the choices/),
				expect.stringMatching(/Text must be text/),
				'A block has no “onclick”',
			])
		);
		expect(r.problems.find(p => /javascript/.test(p.message))).toMatchObject({ nodeId: 'aaaa0002', path: '[1].action' });
	});

	it('drops nothing silently in styles: unknown keys, wrong groups and bad values are errors', () => {
		const r = validateTree([
			{ id: 'spac0001', type: 'spacer', props: {}, style: { base: { color: 'primary' } } },
			{ id: 'sect0001', type: 'section', props: {}, style: { base: { zIndex: 999, background: 'red' }, xl: {} } },
		]);
		expect(errors(r)).toEqual([
			'Spacer doesn’t take type styles',
			'“999” isn’t an allowed zIndex',
			'There is no style “background”',
			'Styles are per screen size: base, md, lg',
		]);
	});

	it('enforces depth, slots and children', () => {
		let deep: any = { id: 'leaf0000', type: 'text', props: {} };
		for (let i = 0; i < 31; i++) deep = { id: `deep${String(i).padStart(4, '0')}`, type: 'stack', props: {}, children: [deep] };
		expect(errors(validateTree([deep]))).toContain('Blocks are nested too deep (the limit is 30 levels)');
		expect(errors(validateTree([{ id: 'head0001', type: 'heading', props: {}, children: [] }]))).toEqual(['Heading can’t hold other blocks']);
		expect(errors(validateTree([{ id: 'sect0001', type: 'section', props: {}, slots: { media: [] } }]))).toEqual(['Section has no slot “media”']);
	});

	it('lets a missing action target save, but not publish', () => {
		const r = validateTree([{ id: 'butn0001', type: 'button', props: {}, action: { type: 'open', target: 'gone0001' } }]);
		expect(r.ok).toBe(false);
		expect(r.problems).toEqual([expect.objectContaining({ level: 'publish', nodeId: 'butn0001' })]);
		expect(validateTree([{ id: 'butn0001', type: 'button', props: {}, action: { type: 'open', target: 'gone0001' } }], { externalIds: new Set(['gone0001']) }).ok).toBe(true);
	});

	it('overlays sit at the top level, and only overlays open or close', () => {
		const drawer = { id: 'drwr0001', type: 'drawer', props: { side: 'left' }, children: [{ id: 'text0001', type: 'text', props: { html: '<p>Hi</p>' } }] };
		const opener = { id: 'butn0001', type: 'button', props: {}, action: { type: 'toggle', target: 'drwr0001' } };
		expect(validateTree([opener, drawer]).ok).toBe(true);
		expect(errors(validateTree([{ id: 'sect0001', type: 'section', props: {}, children: [drawer] }]))).toEqual([
			'A drawer goes at the top level of the page, not inside another block',
		]);
		expect(errors(validateTree([{ ...opener, action: { type: 'open', target: 'text0001' } }, drawer]))).toEqual([
			'Only a pop-up, drawer or popover can be opened or closed — “text0001” is a text',
		]);
		expect(validateTree([{ ...opener, action: { type: 'scroll', target: 'text0001' } }, drawer]).ok).toBe(true);
	});

	it('refuses too many nodes and too many bytes', () => {
		const many = Array.from({ length: 1501 }, (_, i) => ({ id: `n${String(i).padStart(7, '0')}`, type: 'spacer', props: {} }));
		expect(errors(validateTree(many))).toContain('The page has too many blocks (the limit is 1500)');
		const big = [{ id: 'text0001', type: 'text', props: { html: 'x'.repeat(99_000) } }];
		expect(validateTree([...big, ...Array.from({ length: 6 }, (_, i) => ({ ...big[0], id: `text000${i + 2}` }))]).problems[0].message).toMatch(/too big/);
	});
});

describe('validateDesign', () => {
	it('checks the theme, tokens, layouts and sections', () => {
		const ok = validateDesign({
			theme: 'studio',
			colorScheme: 'system',
			tokens: { colors: { primary: { light: '#ff0066' } }, fonts: { heading: { family: 'Playfair Display', weights: [400, 700] } }, radius: { md: '12px' }, container: 1280, button: { uppercase: true } },
			layouts: { default: { header: [{ id: 'head0001', type: 'heading', props: {} }], footer: [] } },
			sections: { sec00001: { name: 'CTA', tree: [{ id: 'text0001', type: 'text', props: {} }] } },
		});
		expect(ok.problems).toEqual([]);
		const bad = validateDesign({
			theme: 'neon',
			colorScheme: 'sepia',
			tokens: { colors: { primary: { light: 'red;}' }, chartreuse: {} }, fonts: { body: { family: 'Evil"; x' } }, container: 99999, wobble: {} },
			layouts: { none: {}, default: { header: [{ id: 'x', type: 'heading', props: {} }] } },
		});
		expect(bad.problems.map(p => p.path)).toEqual([
			'theme',
			'colorScheme',
			'tokens.colors.primary',
			'tokens.colors.chartreuse',
			'tokens.fonts.body',
			'tokens.container',
			'tokens.wobble',
			'layouts.none',
			'layouts.default.header[0]',
		]);
	});
});

describe('validatePageFields', () => {
	it('checks paths, kinds and SEO', () => {
		expect(validatePageFields({ name: 'About', path: '/about', seo: { title: 'About us', noIndex: false } }).ok).toBe(true);
		expect(validatePageFields({ name: 'Post', path: '/blog/[slug]', kind: 'template', source: { model: 'posts' } }).ok).toBe(true);
		const r = validatePageFields({ name: '', path: '/About Us', seo: { image: 'javascript:x', extra: 1 } });
		expect(r.problems.map(p => p.path)).toEqual(['name', 'path', 'seo.extra', 'seo.image']);
		expect(validatePageFields({ path: '/blog/[slug]' }).problems[0].message).toMatch(/Only template pages/);
		expect(validatePageFields({ path: '/api/x' }).problems[0].message).toMatch(/kept for the site/);
		expect(validatePageFields({ path: '/x', layout: 'landing' }, { layouts: ['default'] }).problems[0].path).toBe('layout');
	});
});
