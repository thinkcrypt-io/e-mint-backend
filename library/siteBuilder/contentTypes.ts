import ComponentDefinition from '../models/builder/componentDefinition.model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { syncDynamicModels } from '../functions/dynamicModels.function.js';
import { checkComponentFields, updateModelCore } from '../controllers/builder/models.controller.js';
import { KIT_ROUTES } from './kit.js';

/**
 * Content types (docs/cms D1, CMS-06): what one Contents record can be — a
 * Hero, Cards, Questions, a List of a model's records… Each is a component
 * under `content.*` (D3), so a project can change them or add its own, and a
 * Contents record holds exactly one, chosen first: its form then shows only
 * that type's fields. The record keeps it in `block` (a content blocks field
 * of one item, D4) with the type's uid in `type`.
 *
 * The built-in types share one vocabulary — eyebrow, heading, text, image,
 * buttonLabel / buttonUrl, items (title, subTitle, description, image, url) —
 * so the site builder's words land in the same places whatever the section
 * (connect.ts), and a site reads `heading` or `items.2.title` the same way.
 */

type F = { key: string; label: string; kind: string; required?: boolean; helper?: string; default?: any; options?: { value: string; label: string }[]; fields?: F[]; addLabel?: string };
export type ContentType = { name: string; title: string; icon: string; description: string; fields: F[] };

const eyebrow: F = { key: 'eyebrow', label: 'Small line above', kind: 'text', helper: 'A word or two over the heading — optional' };
const heading: F = { key: 'heading', label: 'Heading', kind: 'text' };
// Plain words: only Rich text has the editor (its `body`).
const text: F = { key: 'text', label: 'Text', kind: 'textarea' };
const image: F = { key: 'image', label: 'Picture', kind: 'image' };
const imageAlt: F = { key: 'imageAlt', label: 'Picture description', kind: 'text', helper: 'What the picture shows, for screen readers and search engines' };
const button: F[] = [
	{ key: 'buttonLabel', label: 'Button', kind: 'text' },
	{ key: 'buttonUrl', label: 'Button link', kind: 'text', helper: 'A page like /contact, or a full address' },
];
const second: F[] = [
	{ key: 'secondaryLabel', label: 'Second button', kind: 'text' },
	{ key: 'secondaryUrl', label: 'Second button link', kind: 'text' },
];
const items = (label: string, add: string, fields: F[]): F => ({ key: 'items', label, kind: 'sectionlist', addLabel: add, fields });
const row = {
	title: (label = 'Title'): F => ({ key: 'title', label, kind: 'text' }),
	subTitle: (label = 'Small text'): F => ({ key: 'subTitle', label, kind: 'text' }),
	description: (label = 'Description'): F => ({ key: 'description', label, kind: 'textarea' }),
	image: (label = 'Picture'): F => ({ key: 'image', label, kind: 'image' }),
	url: (label = 'Link'): F => ({ key: 'url', label, kind: 'text' }),
};
const CARD_ROW = [row.title(), row.subTitle(), row.description(), row.image(), row.url()];

/** The tests a List's conditions use — the API builder's and the record tabs' (publicRecords conditionQuery). */
export const LIST_OPS = [
	['is', 'is'],
	['not', 'is not'],
	['in', 'is one of'],
	['contains', 'contains'],
	['gt', 'is more than'],
	['gte', 'is at least'],
	['lt', 'is less than'],
	['lte', 'is at most'],
	['empty', 'is empty'],
	['filled', 'is not empty'],
] as const;

export const CONTENT_TYPES: ContentType[] = [
	{
		name: 'hero',
		title: 'Hero',
		icon: 'panel-top',
		description: 'The big opening of a page: a heading, a line of text, buttons and a picture.',
		fields: [eyebrow, heading, text, image, imageAlt, ...button, ...second, items('Numbers under it', 'Add number', [row.title('Number'), row.subTitle('Label')])],
	},
	{
		name: 'hero-carousel',
		title: 'Hero carousel',
		icon: 'gallery-horizontal',
		description: 'The opening of a page as slides that move on — each with its own heading, text, picture and button.',
		fields: [
			items('Slides', 'Add slide', [
				row.subTitle('Small line above'),
				row.title('Heading'),
				row.description('Text'),
				row.image(),
				{ key: 'imageAlt', label: 'Picture description', kind: 'text' },
				{ key: 'buttonLabel', label: 'Button', kind: 'text' },
				row.url('Button link'),
			]),
			{ key: 'interval', label: 'Seconds per slide', kind: 'number', default: 6, helper: '0 to move on only when clicked' },
		],
	},
	{
		name: 'text',
		title: 'Text',
		icon: 'type',
		description: 'A heading and a few paragraphs.',
		fields: [eyebrow, heading, text, ...button],
	},
	{
		name: 'rich-text',
		title: 'Rich text',
		icon: 'file-text',
		description: 'A longer piece with headings, lists, links and pictures in it — an article, a policy.',
		fields: [heading, { key: 'body', label: 'Body', kind: 'editor' }],
	},
	{
		name: 'cards',
		title: 'Cards',
		icon: 'layout-grid',
		description: 'A row of cards — features, services, team, steps, plans — each with its own picture, words and link.',
		fields: [eyebrow, heading, text, items('Cards', 'Add card', CARD_ROW), ...button],
	},
	{
		name: 'faq',
		title: 'Questions',
		icon: 'circle-help',
		description: 'Questions that open to show their answers.',
		fields: [eyebrow, heading, text, items('Questions', 'Add question', [row.title('Question'), row.description('Answer')])],
	},
	{
		name: 'stats',
		title: 'Numbers',
		icon: 'chart-no-axes-column',
		description: 'A few figures in a row — years open, customers, cakes baked.',
		fields: [eyebrow, heading, text, items('Numbers', 'Add number', [row.title('Number'), row.subTitle('Label'), row.description()])],
	},
	{
		name: 'testimonials',
		title: 'Reviews',
		icon: 'quote',
		description: 'What customers say: a quote, their name and a photo.',
		fields: [eyebrow, heading, text, items('Reviews', 'Add review', [row.description('Quote'), row.title('Name'), row.subTitle('Role or company'), row.image('Photo')])],
	},
	{
		name: 'gallery',
		title: 'Gallery',
		icon: 'images',
		description: 'A grid of photos.',
		fields: [eyebrow, heading, text, items('Photos', 'Add photo', [row.image('Photo'), row.title('Caption')])],
	},
	{
		name: 'video',
		title: 'Video',
		icon: 'video',
		description: 'A video from YouTube, Vimeo or a file, with a heading and a caption.',
		fields: [heading, text, { key: 'video', label: 'Video', kind: 'video', helper: 'A YouTube or Vimeo address, or a video file' }],
	},
	{
		name: 'cta',
		title: 'Call to action',
		icon: 'megaphone',
		description: 'A band that asks the visitor to do one thing — book, call, sign up.',
		fields: [eyebrow, heading, text, ...button, ...second],
	},
	{
		name: 'logos',
		title: 'Logos',
		icon: 'gem',
		description: 'Customers, partners or press, as a strip of logos.',
		fields: [heading, items('Logos', 'Add logo', [row.image('Logo'), row.title('Name'), row.url()])],
	},
	{
		name: 'image',
		title: 'Picture',
		icon: 'image',
		description: 'One picture with a caption.',
		fields: [image, imageAlt, { key: 'caption', label: 'Caption', kind: 'text' }],
	},
	{
		name: 'list',
		title: 'List',
		icon: 'list',
		description: 'Records of one of your models — projects, posts, services — as cards: how many, in what order, which ones.',
		fields: [
			eyebrow,
			heading,
			text,
			{ key: 'source', label: 'Model', kind: 'text', required: true, helper: 'The address of the model whose records it shows, e.g. projects' },
			{ key: 'limit', label: 'How many', kind: 'number', default: 6 },
			{ key: 'sort', label: 'Order', kind: 'text', default: '-createdAt', helper: 'A field to sort by — a minus first for newest or largest first' },
			{ key: 'match', label: 'Show records matching', kind: 'select', default: 'all', options: [{ value: 'all', label: 'All conditions' }, { value: 'any', label: 'Any condition' }] },
			{ key: 'when', label: 'Conditions', kind: 'sectionlist', addLabel: 'Add condition', fields: [
				{ key: 'field', label: 'Field', kind: 'text' },
				{ key: 'op', label: 'Is', kind: 'select', options: LIST_OPS.map(([value, label]) => ({ value, label })) },
				{ key: 'value', label: 'Value', kind: 'text' },
			] },
			{ key: 'cardTitle', label: 'Card title', kind: 'text', helper: 'The field each card’s title shows' },
			{ key: 'cardText', label: 'Card text', kind: 'text' },
			{ key: 'cardImage', label: 'Card picture', kind: 'text' },
			{ key: 'link', label: 'Each card links to', kind: 'text', helper: 'e.g. /projects/{slug} — {field} is filled in from the record' },
			...button,
		],
	},
	{
		name: 'section',
		title: 'Section',
		icon: 'square-dashed',
		description: 'Anything else: a heading, text, a picture, buttons and a list of rows.',
		fields: [eyebrow, heading, { key: 'subheading', label: 'Second heading', kind: 'text' }, text, image, imageAlt, ...button, ...second, items('Rows', 'Add row', CARD_ROW)],
	},
	{
		name: 'header',
		title: 'Header',
		icon: 'panel-top-open',
		description: 'The top of every page: its words and buttons (the menu comes from your pages).',
		fields: [{ key: 'heading', label: 'Name shown', kind: 'text' }, text, ...button, ...second, items('Links', 'Add link', [row.title('Text'), row.url()])],
	},
	{
		name: 'footer',
		title: 'Footer',
		icon: 'panel-bottom',
		description: 'The bottom of every page: a line about you, links and the small print.',
		fields: [heading, text, items('Links', 'Add link', [row.title('Text'), row.url()]), ...button, { key: 'subheading', label: 'Small print', kind: 'text', helper: 'e.g. © 2026 Corner Bakery' }],
	},
];

export const CONTENT_CATEGORY = 'content';
export const typeUid = (name: string) => `${CONTENT_CATEGORY}.${name}`;
export const LIST_TYPE = typeUid('list');

/**
 * Built-in types made before their Text was plain words (2026-10-20) had the
 * editor for it: switched to a text box, nothing else of the type touched.
 * The words stay as they were; the Contents form shows old HTML as plain text.
 */
const plainTextUpgrade = async () => {
	const uids = CONTENT_TYPES.filter(t => t.fields.some(f => f.key === 'text' && f.kind === 'textarea')).map(t => typeUid(t.name));
	const res = await ComponentDefinition.updateMany(
		{ category: CONTENT_CATEGORY, uid: { $in: uids }, fields: { $elemMatch: { key: 'text', kind: 'editor' } } },
		{ $set: { 'fields.$[t].kind': 'textarea' } },
		{ arrayFilters: [{ 't.key': 'text', 't.kind': 'editor' }] }
	);
	return res.modifiedCount || 0;
};

/** The built-in types this project doesn't have yet, made. A type the project changed stays as it is. Runs in the project's scope. */
export const ensureContentTypes = async (req?: any) => {
	const upgraded = await plainTextUpgrade();
	const have = new Set((await ComponentDefinition.find({ category: CONTENT_CATEGORY }, { uid: 1 }).lean()).map((c: any) => c.uid));
	const missing = CONTENT_TYPES.filter(t => !have.has(typeUid(t.name)));
	if (!missing.length) {
		if (upgraded) await syncDynamicModels({ app: req?.app, force: true });
		return 0;
	}
	for (const t of missing)
		try {
			// Checked as any component is, so the fields are stored the way the builder stores them.
			const { fields, problems } = await checkComponentFields(req || {}, JSON.parse(JSON.stringify(t.fields)));
			if (problems.length) throw new Error(`content type ${t.name}: ${problems.join('; ')}`);
			await ComponentDefinition.create({ uid: typeUid(t.name), category: CONTENT_CATEGORY, name: t.name, title: t.title, description: t.description, icon: t.icon, fields, createdBy: req?.user?._id });
		} catch (e: any) {
			if (e?.code !== 11000) throw e;
		}
	await syncDynamicModels({ app: req?.app, force: true });
	return missing.length;
};

/** Every content type of the project (the built-in ones and its own), in the order a picker shows them. */
export const contentTypes = async () => {
	const all: any[] = await ComponentDefinition.find({ category: CONTENT_CATEGORY }).lean();
	const order = new Map(CONTENT_TYPES.map((t, i) => [typeUid(t.name), i]));
	return all.sort((a, b) => (order.get(a.uid) ?? 99) - (order.get(b.uid) ?? 99) || String(a.title).localeCompare(String(b.title)));
};

/** The most blocks one Contents record holds, its own first one included. */
export const BLOCKS_MAX = 20;

/** The fields a typed Contents record adds to the kit's model (docs/cms D1). */
const TYPED_FIELDS = (uids: string[]) => [
	{ key: 'type', label: 'Type', kind: 'text', index: true, helper: 'The content type — set when the record is made' },
	{ key: 'order', label: 'Order', kind: 'number', default: 0, helper: 'Its place on the page, smallest first' },
	// Its own type first, then any blocks added under it (a Text, then a Gallery…).
	{ key: 'block', label: 'Content', kind: 'blocks', components: uids, max: BLOCKS_MAX },
];

/**
 * The project's Contents model, able to hold typed records: `type`, `order`
 * and `block` added, and `block` taking every content type there is (a type
 * the project adds is taken too), and records drafts until published (D5).
 * The old catch-all fields stay until the
 * site is moved over (CMS-06 migration). Returns the model's definition, or
 * null when the project has no Contents model.
 */
export const ensureTypedContents = async (req: any) => {
	await ensureContentTypes(req);
	const def: any = await ModelDefinition.findOne({ route: KIT_ROUTES.contents, active: { $ne: false } }).lean();
	if (!def) return null;
	const uids = (await contentTypes()).map(t => t.uid);
	const fields: any[] = [...(def.fields || [])];
	let changed = false;
	for (const f of TYPED_FIELDS(uids)) {
		const i = fields.findIndex(x => x.key === f.key);
		if (i < 0) {
			fields.push(f);
			changed = true;
		} else if (f.kind === 'blocks' && (fields[i].kind !== 'blocks' || fields[i].max !== BLOCKS_MAX || [...uids].sort().join() !== [...(fields[i].components || [])].sort().join())) {
			fields[i] = { ...fields[i], kind: 'blocks', components: uids, max: BLOCKS_MAX };
			changed = true;
		}
	}
	// Drafts until Publish (D5): the site's Publish, or Publish on the Contents screen, puts words live.
	if (!def.draftAndPublish) changed = true;
	if (!changed) return def;
	const { _id, name, route, sidebar, collectionName, createdAt, updatedAt, version, __v, organization, project, ...rest } = def;
	// Turning drafts on publishes what's there, so nothing leaves the site.
	const out = await updateModelCore(req, def._id, { ...rest, fields, draftAndPublish: true }, { note: 'Contents: typed records, drafts until published (CMS-06)' });
	return out.doc;
};
