import ModelDefinition from '../models/builder/modelDefinition.model.js';
import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import SiteRelease from '../models/siteBuilder/siteRelease.model.js';
import { compiledModel, syncDynamicModels } from '../functions/dynamicModels.function.js';
import { buildFeature } from '../controllers/builder/features.service.js';
import { planFromAi } from '../controllers/builder/features.schema.js';
import { TenancyError } from '../functions/tenancy.function.js';
import { loadManifest, presetTree } from './manifest.js';
import { newId } from './ids.js';
import { EMPTY_SEO, ensureSite } from './site.js';
import { validateTree } from './validate.js';
import { kitModel, KIT_ROUTES, pushDesign, pushSeo, upsertContents } from './kit.js';
import { connectTree, holdsCards } from './connect.js';
import { loadSite } from '../functions/siteConfig.function.js';

/**
 * A theme's demo site (docs/site-builder SB-28): choosing a theme can load a
 * whole site in it instead of a blank page — pages built from the theme's
 * kind of presets, a list model that suits it (a menu, services, products…)
 * with its public API on and sample records, and every demo text saved as a
 * Contents record its block is bound to (connect.ts — grids of cards become
 * lists of cards in Contents), so the team changes the words in the panel or
 * the builder. The site's name (Website settings) replaces the demo
 * business's. Nothing goes live until Publish. Runs inside the project's scope.
 */

type Field = { key: string; label: string; kind: string; required?: boolean; options?: { value: string; label: string }[] };
type ListSpec = { name: string; route: string; title: string; one: string; fields: Field[]; price?: boolean; records: Record<string, any>[]; f?: FieldMap };
/** Which of the list model's fields the cards show — the demo's own, or the closest of a model that was already there. */
type FieldMap = { title: string; summary: string | null; image: string | null; price: string | null; slug: string };

const DEMO_FIELDS: FieldMap = { title: 'title', summary: 'summary', image: 'image', price: 'price', slug: 'slug' };

/** A model that was already at the list's route (a template's Services…): its fields for title, summary, picture, price and address. */
const fieldMapOf = (def: any): FieldMap => {
	const fields: any[] = def?.fields || [];
	const pick = (keys: string[], kinds?: string[]) => {
		for (const k of keys) {
			const f = fields.find(x => x.key.toLowerCase() === k.toLowerCase() && (!kinds || kinds.includes(x.kind)));
			if (f) return f.kind === 'images' ? `${f.key}.0` : f.key;
		}
		return null;
	};
	return {
		title: pick(['title', 'name', def?.displayField || 'title']) || '_id',
		summary: pick(['summary', 'shortDescription', 'excerpt', 'subtitle', 'description', 'content', 'body'], ['text', 'textarea', 'editor']),
		image: pick(['image', 'picture', 'photo', 'thumbnail', 'cover', 'images', 'gallery'], ['image', 'images', 'url']),
		price: pick(['price', 'amount', 'cost', 'fee'], ['number']),
		slug: pick(['slug'], ['text']) || '_id',
	};
};
type Section = string | { list: 'featured' | 'all'; title: string; intro?: string };
type PageSpec = { name: string; path: string; sections: Section[]; seo: { title: string; description: string } };
type Starter = {
	business: string;
	header: string;
	footer: string;
	hero: { heading: string; text: string; button?: string };
	cta?: { heading: string; text: string; button?: string };
	list: ListSpec;
	pages: PageSpec[];
};

const opt = (...v: string[]) => v.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const rows = (list: [string, string, number?][], more: (i: number) => Record<string, any> = () => ({})) =>
	list.map(([title, summary, price], i) => ({ title, slug: slug(title), summary, ...(price !== undefined && { price }), image: `placeholder:800x600:${title}`, ...more(i) }));

const SERVICE_FIELDS: Field[] = [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'slug', label: 'Slug', kind: 'text', required: true },
	{ key: 'summary', label: 'Summary', kind: 'textarea' },
	{ key: 'image', label: 'Picture', kind: 'image' },
];
const PRICED = [...SERVICE_FIELDS, { key: 'price', label: 'Price', kind: 'number' }];

const about = (business: string): PageSpec => ({ name: 'About', path: '/about', sections: ['page-title', 'features-split', 'team', 'cta-banner'], seo: { title: `About ${business}`, description: `Who we are and how we work at ${business}.` } });
const contact = (business: string): PageSpec => ({ name: 'Contact', path: '/contact', sections: ['page-title', 'contact'], seo: { title: `Contact ${business}`, description: `Get in touch with ${business}.` } });

export const STARTERS: Record<string, Starter> = {
	studio: {
		business: 'Northwind Consulting',
		header: 'header-bar',
		footer: 'footer-columns',
		hero: { heading: 'Clear advice for growing businesses', text: 'We help small teams plan, build and grow — with straight answers and work that lasts.', button: 'Book a call' },
		cta: { heading: 'Let’s talk about your next step', text: 'A free 30-minute call. No slides, no pressure.', button: 'Book a call' },
		list: {
			name: 'Service', route: 'services', title: 'Services', one: 'service', fields: PRICED, price: true,
			records: rows([['Strategy', 'A clear plan for the next twelve months, built with your team.', 1200], ['Brand design', 'A name, a logo and a look that fit who you are.', 2400], ['Websites', 'A fast site your team can change without a developer.', 3000], ['Growth', 'Campaigns, numbers and the habits that keep them climbing.', 900]]),
		},
		pages: [
			{ name: 'Home', path: '/', sections: ['hero-split', { list: 'featured', title: 'What we do', intro: 'Four ways we help — pick one, or ask.' }, 'stats', 'testimonials-grid', 'cta-banner'], seo: { title: 'Northwind Consulting — clear advice for growing businesses', description: 'Strategy, brand, websites and growth for small teams.' } },
			{ name: 'Services', path: '/services', sections: ['page-title', { list: 'all', title: 'Our services' }, 'faq', 'cta-banner'], seo: { title: 'Services', description: 'Strategy, brand design, websites and growth.' } },
			about('Northwind Consulting'),
			contact('Northwind Consulting'),
		],
	},
	bistro: {
		business: 'Bistro Rosa',
		header: 'header-centered',
		footer: 'footer-centered',
		hero: { heading: 'Seasonal plates, made with care', text: 'A neighbourhood bistro with a short menu that changes with the market. Walk in, or book a table.', button: 'Book a table' },
		cta: { heading: 'Your table is waiting', text: 'Open Tuesday to Sunday, from 5pm.', button: 'Book a table' },
		list: {
			name: 'MenuItem', route: 'menu', title: 'Menu', one: 'dish',
			fields: [...PRICED, { key: 'course', label: 'Course', kind: 'select', options: opt('starters', 'mains', 'desserts') }], price: true,
			records: rows([['Burrata & peaches', 'Charred peaches, basil oil, toasted sourdough.', 14], ['Mussels marinière', 'White wine, shallots, cream and frites.', 22], ['Duck confit', 'Lentils, pickled cherries, crisp skin.', 28], ['Wild mushroom risotto', 'Aged parmesan, thyme, brown butter.', 21], ['Tarte tatin', 'Caramelised apples, crème fraîche.', 11], ['Chocolate pot', 'Dark chocolate, sea salt, shortbread.', 10]], i => ({ course: i < 1 ? 'starters' : i < 4 ? 'mains' : 'desserts' })),
		},
		pages: [
			{ name: 'Home', path: '/', sections: ['hero-image', 'features-split', { list: 'featured', title: 'From the menu', intro: 'A few of this week’s favourites.' }, 'testimonials-carousel', 'cta-banner'], seo: { title: 'Bistro Rosa — seasonal plates, made with care', description: 'A neighbourhood bistro with a menu that follows the market.' } },
			{ name: 'Menu', path: '/menu', sections: ['page-title', { list: 'all', title: 'This week’s menu' }, 'cta-banner'], seo: { title: 'Menu', description: 'Starters, mains and desserts — this week at Bistro Rosa.' } },
			{ name: 'About', path: '/about', sections: ['page-title', 'features-split', 'gallery'], seo: { title: 'About Bistro Rosa', description: 'Our kitchen, our suppliers and our story.' } },
			contact('Bistro Rosa'),
		],
	},
	editorial: {
		business: 'Paper & Ink',
		header: 'header-stacked',
		footer: 'footer-centered',
		hero: { heading: 'Stories, essays and notes from the desk', text: 'A small studio writing about craft, places and the people who make things.' },
		list: {
			name: 'Post', route: 'posts', title: 'Posts', one: 'post', fields: [...SERVICE_FIELDS, { key: 'body', label: 'Body', kind: 'editor' }],
			records: rows([['How we started', 'A kitchen table, two laptops and a stubborn idea.'], ['Five tips for spring', 'Small changes that make the longer days count.'], ['A day at the print shop', 'Ink, paper and the people who still set type by hand.'], ['Notes on slow work', 'Why we stopped chasing speed — and what we got back.']], i => ({ body: `<p>${['It began', 'Spring is', 'The press', 'We used to'][i]} … the rest of the post goes here.</p>` })),
		},
		pages: [
			{ name: 'Home', path: '/', sections: ['hero-minimal', { list: 'featured', title: 'Latest stories' }, 'newsletter'], seo: { title: 'Paper & Ink — stories and notes from the desk', description: 'Essays about craft, places and people who make things.' } },
			{ name: 'Journal', path: '/posts', sections: ['page-title', { list: 'all', title: 'All posts' }], seo: { title: 'Journal', description: 'Every story from Paper & Ink.' } },
			about('Paper & Ink'),
			contact('Paper & Ink'),
		],
	},
	market: {
		business: 'Fern & Field',
		header: 'header-bar',
		footer: 'footer-columns',
		hero: { heading: 'Good things for slow mornings', text: 'Linen, ceramics and pantry goods from small makers — packed by hand and sent in two days.', button: 'Shop now' },
		cta: { heading: 'Free delivery over $60', text: 'And easy returns within 30 days.', button: 'Shop now' },
		list: {
			name: 'Product', route: 'products', title: 'Products', one: 'product', fields: PRICED, price: true,
			records: rows([['Linen apron', 'Stonewashed linen with deep pockets.', 42], ['Stoneware mug', 'Hand-thrown, holds a generous 350 ml.', 24], ['Wildflower honey', 'Raw, from hives two hours north.', 14], ['Olive wood board', 'One piece, oiled and ready to serve.', 56], ['Canvas tote', 'Heavy cotton, made to carry the market home.', 28], ['Beeswax candle', 'Hand-poured, burns for 40 hours.', 18]]),
		},
		pages: [
			{ name: 'Home', path: '/', sections: ['hero-split', { list: 'featured', title: 'Best sellers' }, 'features-cards', 'testimonials-grid', 'newsletter'], seo: { title: 'Fern & Field — good things for slow mornings', description: 'Linen, ceramics and pantry goods from small makers.' } },
			{ name: 'Shop', path: '/products', sections: ['page-title', { list: 'all', title: 'Everything' }, 'cta-banner'], seo: { title: 'Shop', description: 'Every product at Fern & Field.' } },
			about('Fern & Field'),
			contact('Fern & Field'),
		],
	},
	calm: {
		business: 'Stillwater Studio',
		header: 'header-centered',
		footer: 'footer-centered',
		hero: { heading: 'Make room to breathe', text: 'Small yoga and breathwork classes in a quiet studio by the river. Beginners always welcome.', button: 'See classes' },
		cta: { heading: 'Your first class is on us', text: 'Come as you are — mats and tea provided.', button: 'Book a class' },
		list: {
			name: 'Class', route: 'classes', title: 'Classes', one: 'class', fields: [...PRICED, { key: 'duration', label: 'Length (minutes)', kind: 'number' }], price: true,
			records: rows([['Morning flow', 'A gentle start: breath, movement and stillness.', 18], ['Breathwork', 'Simple techniques to calm a busy mind.', 15], ['Restorative', 'Long holds with bolsters and blankets.', 20], ['Beginners', 'The basics, slowly and kindly explained.', 12]], i => ({ duration: [60, 45, 75, 50][i] })),
		},
		pages: [
			{ name: 'Home', path: '/', sections: ['hero-centered', 'features-cards', { list: 'featured', title: 'Classes this week' }, 'testimonial-single', 'cta-banner'], seo: { title: 'Stillwater Studio — make room to breathe', description: 'Small yoga and breathwork classes by the river.' } },
			{ name: 'Classes', path: '/classes', sections: ['page-title', { list: 'all', title: 'All classes' }, 'faq', 'cta-banner'], seo: { title: 'Classes', description: 'Yoga and breathwork classes at Stillwater Studio.' } },
			about('Stillwater Studio'),
			contact('Stillwater Studio'),
		],
	},
	bright: {
		business: 'Brightside',
		header: 'header-bar',
		footer: 'footer-columns',
		hero: { heading: 'Plan your week in five minutes', text: 'Brightside turns your to-dos into a calm, realistic plan — and nudges you when it matters.', button: 'Start free' },
		cta: { heading: 'Try Brightside free for 14 days', text: 'No card needed. Cancel any time.', button: 'Start free' },
		list: {
			name: 'Feature', route: 'features', title: 'Features', one: 'feature', fields: SERVICE_FIELDS,
			records: rows([['Smart planning', 'Drop in your tasks; get a week that actually fits.'], ['Gentle reminders', 'A nudge at the right moment, never a nag.'], ['Shared lists', 'Plan the household or the team together.'], ['Focus mode', 'One task, a timer and nothing else.']]),
		},
		pages: [
			{ name: 'Home', path: '/', sections: ['hero-signup', 'logos', { list: 'featured', title: 'Everything you need, nothing you don’t' }, 'steps', 'pricing-three', 'cta-banner'], seo: { title: 'Brightside — plan your week in five minutes', description: 'A calm, realistic weekly plan from your to-do list.' } },
			{ name: 'Features', path: '/features', sections: ['page-title', { list: 'all', title: 'All features' }, 'faq'], seo: { title: 'Features', description: 'Everything Brightside does.' } },
			{ name: 'Pricing', path: '/pricing', sections: ['page-title', 'pricing-three', 'faq', 'cta-banner'], seo: { title: 'Pricing', description: 'Simple plans for one person or a whole team.' } },
			contact('Brightside'),
		],
	},
	mono: {
		business: 'Ines Varga',
		header: 'header-bar',
		footer: 'footer-centered',
		hero: { heading: 'Architecture and interiors', text: 'Independent practice. Houses, small public buildings and rooms that last.' },
		list: {
			name: 'Work', route: 'work', title: 'Work', one: 'project', fields: [...SERVICE_FIELDS, { key: 'year', label: 'Year', kind: 'number' }],
			records: rows([['House on the ridge', 'A timber house that steps down the slope.'], ['Library extension', 'A reading room under one long roof.'], ['Courtyard flat', 'Two rooms opened around a small garden.'], ['Studio barn', 'A workshop in a converted barn.']], i => ({ year: [2025, 2024, 2023, 2022][i] })),
		},
		pages: [
			{ name: 'Home', path: '/', sections: ['hero-minimal', { list: 'featured', title: 'Selected work' }, 'cta-card'], seo: { title: 'Ines Varga — architecture and interiors', description: 'Independent architecture practice: houses and small public buildings.' } },
			{ name: 'Work', path: '/work', sections: ['page-title', { list: 'all', title: 'All projects' }], seo: { title: 'Work', description: 'Projects by Ines Varga.' } },
			about('Ines Varga'),
			contact('Ines Varga'),
		],
	},
};

/** What the editor offers per theme: the business it's dressed as, and its pages. */
export const starterSummaries = () =>
	Object.fromEntries(Object.entries(STARTERS).map(([theme, s]) => [theme, { business: s.business, pages: s.pages.map(p => p.name), list: s.list.title }]));

/* --------------------------------------------------------------- trees */

const walk = (nodes: any[], fn: (n: any) => void) =>
	(nodes || []).forEach(n => {
		if (!n || typeof n !== 'object') return;
		fn(n);
		walk(n.children, fn);
		Object.values<any>(n.slots || {}).forEach(s => walk(s, fn));
	});

/** A preset's first heading / text after it / button, rewritten. */
const rewrite = (tree: any[], copy: { heading: string; text: string; button?: string }) => {
	let heading = false;
	let text = false;
	let button = false;
	walk(tree, n => {
		if (n.type === 'heading' && !heading) {
			n.props.text = copy.heading;
			heading = true;
		} else if (n.type === 'text' && heading && !text) {
			n.props.html = `<p>${copy.text}</p>`;
			text = true;
		} else if (n.type === 'button' && copy.button && !button) {
			n.props.label = copy.button;
			button = true;
		}
	});
	return tree;
};

const node = (type: string, props: Record<string, any> = {}, extra: Record<string, any> = {}) => ({ id: newId(), type, props, ...extra });

/** A section with a title and the list model's records as cards; `featured` shows three. */
const listSection = (list: ListSpec, s: { list: 'featured' | 'all'; title: string; intro?: string }) => {
	const f = list.f || DEMO_FIELDS;
	const card = node('card', { variant: 'elevated' }, {
		children: [
			...(f.image ? [node('image', { src: 'placeholder:800x600:Picture', alt: list.one, ratio: '4/3', rounded: 'lg' }, { bind: { src: { from: 'item', field: f.image }, alt: { from: 'item', field: f.title } } })] : []),
			node('heading', { text: `{{item.${f.title}}}`, level: 3 }),
			...(f.summary ? [node('text', { html: `<p>{{item.${f.summary} | truncate:160}}</p>`, muted: true })] : []),
			...(list.price && f.price ? [node('text', { html: `<p><strong>{{item.${f.price} | money}}</strong></p>` })] : []),
			node('link', { text: 'More →' }, { action: { type: 'link', href: `/${list.route}/{{item.${f.slug}}}` } }),
		],
	});
	return node('section', { paddingY: 'lg' }, {
		name: s.title,
		children: [
			node('stack', { direction: 'column', gap: 6 }, {
				children: [
					node('heading', { text: s.title, level: 2 }),
					...(s.intro ? [node('text', { html: `<p>${s.intro}</p>`, muted: true })] : []),
					node('collection', {
						source: { model: list.route, sort: 'createdAt', pageSize: s.list === 'featured' ? 3 : 12 },
						layout: 'grid', columns: 3, columnsTablet: 2, columnsMobile: 1, gap: 6, pagination: s.list === 'all',
					}, { children: [card] }),
				],
			}),
		],
	});
};

/** The detail page of one record: /<route>/[slug]. */
const detailTree = (list: ListSpec, f: FieldMap = list.f || DEMO_FIELDS) => [
	node('section', { paddingY: 'lg', width: 'narrow' }, {
		name: list.title,
		children: [
			node('stack', { direction: 'column', gap: 6 }, {
				children: [
					node('link', { text: `← All ${list.title.toLowerCase()}` }, { action: { type: 'link', href: `/${list.route}` } }),
					node('heading', { text: `{{record.${f.title}}}`, level: 1 }),
					...(f.image ? [node('image', { src: 'placeholder:1200x800:Picture', alt: list.one, ratio: '16/9', rounded: 'xl' }, { bind: { src: { from: 'record', field: f.image }, alt: { from: 'record', field: f.title } } })] : []),
					...(f.summary && f.summary !== 'body' ? [node('text', { html: '', size: 'lg' }, { bind: { html: { from: 'record', field: f.summary } } })] : []),
					...(list.price && f.price ? [node('text', { html: `<p><strong>{{record.${f.price} | money}}</strong></p>` })] : []),
					...(list.fields.some(f => f.key === 'body') ? [node('text', { html: '' }, { bind: { html: { from: 'record', field: 'body' } } })] : []),
				],
			}),
		],
	}),
];

/* --------------------------------------------------------------- apply */

/** The list model: the one already at its route, or built now; its public API on; sample records if it's empty. */
const ensureList = async (req: any, list: ListSpec, category: string) => {
	let def: any = await ModelDefinition.findOne({ route: list.route }).lean();
	if (!def) {
		const built = await buildFeature(
			req,
			planFromAi({
				title: list.title,
				summary: `The ${list.title.toLowerCase()} the website shows.`,
				sidebarCategory: category,
				steps: [{ action: 'create', name: list.name, route: list.route, title: list.title, rationale: `The site’s ${list.title.toLowerCase()} — shown in lists and on their own pages.`, displayField: 'title', fields: list.fields }],
			}),
			{ source: 'wizard' }
		);
		def = await ModelDefinition.findOne({ route: built.created[0]?.route || list.route }).lean();
	}
	if (!def) throw new TenancyError(500, `The ${list.title} model couldn’t be made`);
	const actions = new Set<string>([...(def.publicApi?.enabled ? def.publicApi.actions || [] : []), 'list', 'get']);
	await ModelDefinition.updateOne({ _id: def._id }, { $set: { 'publicApi.enabled': true, 'publicApi.actions': [...actions], 'publicApi.auth': 'none' }, $inc: { version: 1 } });
	await syncDynamicModels({ app: req.app, force: true });
	const Model = compiledModel(def.name);
	if (Model && !(await Model.countDocuments({}))) {
		const keys = new Set(def.fields.map((f: any) => f.key));
		for (const r of list.records) await Model.create(Object.fromEntries(Object.entries(r).filter(([k]) => keys.has(k))));
	}
	return def;
};

/** Whether the site is still the blank one a new project starts with (so a demo may replace it without asking). */
export const isBlankSite = async () => {
	const pages: any[] = await SitePage.find({ deletedAt: null }, { isHome: 1, draft: 1, published: 1 }).lean();
	return pages.length <= 1 && pages.every(p => !p.published && (p.draft?.rev || 1) <= 2);
};

/**
 * Whether nobody has worked on the site yet — the home page a new project
 * starts with, never published, barely saved: the builder loads the theme's
 * demo site by itself the first time it opens one (SB-29).
 */
export const isUntouchedSite = async () => {
	const pages: any[] = await SitePage.find({}, { deletedAt: 1, published: 1, 'draft.rev': 1 }).limit(2).lean();
	if (pages.length !== 1 || pages[0].deletedAt || pages[0].published || (pages[0].draft?.rev || 1) > 3) return false;
	return !(await SiteRelease.exists({}));
};

/**
 * Loads `theme`'s demo site. Its pages replace the site's (the old ones go off
 * the site at the next Publish; nothing is live until then), the home page
 * keeps its id. `replace` must be sent unless the site is still blank.
 */
export const applyStarter = async (req: any, theme: string, { replace = false, project = req.project }: { replace?: boolean; project?: any } = {}) => {
	const demo = STARTERS[theme];
	if (!demo || !loadManifest().themeKeys.has(theme)) throw new TenancyError(400, `There is no demo site for the theme “${theme}”`);
	// Dressed as the project's own business when Website settings name it.
	const own = project ? String(((await loadSite(project, { cached: true })) as any)?.identity?.siteName || '').trim() : '';
	const starter: Starter = own && !own.includes('{{') ? JSON.parse(JSON.stringify(demo).split(demo.business).join(own.replace(/["\\]/g, ''))) : demo;
	await ensureSite();
	if (!replace && !(await isBlankSite())) throw new TenancyError(409, 'The site already has pages — send replace: true to put the demo in their place');

	const kitPages: any = await ModelDefinition.findOne({ route: KIT_ROUTES.pages }, { sidebarCategory: 1 }).lean();
	const list = await ensureList(req, starter.list, kitPages?.sidebarCategory || 'Website');
	// The route the model has (a list model that was already there keeps its own).
	const listSpec: ListSpec = { ...starter.list, route: list.route, f: fieldMapOf(list) };
	const f = listSpec.f!;

	const contents = await kitModel(KIT_ROUTES.contents);
	const cards = holdsCards(contents?.def);

	// The design: the theme as it comes, its header and footer (their words in Contents too).
	const design: any = await SiteDesign.findOne({}).lean();
	const header = presetTree(starter.header);
	const footer = presetTree(starter.footer);
	const layoutRecords = contents
		? [...connectTree(header, { pageKey: 'header', pageName: 'Header', slugs: 'count', cards }).records, ...connectTree(footer, { pageKey: 'footer', pageName: 'Footer', slugs: 'count', cards }).records]
		: [];
	const draft = { ...design.draft, theme, tokens: {}, layouts: { ...(design.draft?.layouts || {}), default: { header, footer } } };
	const savedDesign: any = await SiteDesign.findOneAndUpdate({ _id: design._id }, { $set: { draft: { ...draft, rev: (design.draft?.rev || 1) + 1 } } }, { new: true }).lean();
	await pushDesign(savedDesign.draft);

	// The pages: home keeps its id; the others are new; the old ones step aside.
	const old: any[] = await SitePage.find({ deletedAt: null }).lean();
	const home = old.find(p => p.isHome);
	const now = new Date();
	for (const p of old) if (!p.isHome) await SitePage.updateOne({ _id: p._id }, { $set: { deletedAt: now } });
	const contentRecords: { page: any; records: any[] }[] = [];
	let priority = starter.pages.length + 1;
	const made: any[] = [];
	for (const spec of starter.pages) {
		const tree: any[] = [];
		for (const s of spec.sections) {
			if (typeof s === 'string') {
				const t = presetTree(s);
				if (s.startsWith('hero')) rewrite(t, starter.hero);
				else if (starter.cta && s.startsWith('cta')) rewrite(t, starter.cta);
				else if (s === 'page-title') rewrite(t, { heading: spec.name, text: spec.seo.description });
				tree.push(...t);
			} else tree.push(listSection(listSpec, s));
		}
		const records = contents ? connectTree(tree, { pageKey: slug(spec.name) || 'home', pageName: spec.name, slugs: 'count', cards }).records : [];
		const errors = validateTree(tree).problems.filter(p => p.level === 'error');
		if (errors.length) throw new TenancyError(500, `The ${theme} demo’s ${spec.name} page has problems: ${errors.slice(0, 3).map(e => e.message).join('; ')}`);
		const fields = { name: spec.name, path: spec.path, kind: 'static', showInMenu: true, menuLabel: '', priority: priority--, layout: 'default' };
		const draftDoc = { tree, seo: { ...EMPTY_SEO, ...spec.seo }, updatedAt: now, updatedBy: req.user?._id };
		let page: any;
		if (spec.path === '/' && home) {
			page = await SitePage.findOneAndUpdate({ _id: home._id }, { $set: { ...fields, 'draft.tree': tree, 'draft.seo': draftDoc.seo, 'draft.updatedAt': now }, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
		} else page = (await SitePage.create({ ...fields, isHome: spec.path === '/', draft: { ...draftDoc, rev: 1 } })).toObject();
		made.push(page);
		contentRecords.push({ page, records });
	}
	// The detail page of each record of the list.
	const detailErrors = validateTree(detailTree(listSpec)).problems.filter(p => p.level === 'error');
	if (detailErrors.length) throw new TenancyError(500, `The ${theme} demo’s detail page has problems: ${detailErrors[0].message}`);
	const detail = (await SitePage.create({
		name: starter.list.title.replace(/s$/, ''),
		path: `/${listSpec.route}/[slug]`,
		kind: 'template',
		source: { model: list.route, match: { param: 'slug', field: f.slug } },
		showInMenu: false,
		priority: 0,
		isHome: false,
		draft: { tree: detailTree(listSpec), seo: { ...EMPTY_SEO, title: `{{record.${f.title}}} — ${starter.business}`, description: f.summary ? `{{record.${f.summary} | truncate:300}}` : '' }, rev: 1, updatedAt: now, updatedBy: req.user?._id },
	})).toObject();
	made.push(detail);

	// The words into Contents, and each page's SEO into its SEO record.
	let saved = 0;
	if (layoutRecords.length) saved += (await upsertContents(layoutRecords)).length;
	for (const { page, records } of contentRecords) {
		if (contents && records.length) saved += (await upsertContents(records, page)).length;
		await pushSeo(page, page.draft.seo);
	}
	await pushSeo(detail, detail.draft.seo);
	return { theme, business: starter.business, pages: made.map(p => ({ id: String(p._id), name: p.name, path: p.path })), list: { model: list.route, title: list.title }, contents: saved, home: String(made[0]._id) };
};
