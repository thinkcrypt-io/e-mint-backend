import History from '../models/history/model.js';
import type { HistoryAction, HistoryChange } from '../models/history/model.js';

/**
 * Collections that never write history.
 *
 * These are append-only analytics and file bookkeeping: a page view or a click
 * is not something a person "did to a record", and at their write volume they
 * would bury the entries that matter. Add a mongoose model name here to opt a
 * collection out.
 */
const SKIP_MODELS = new Set([
	'History',
	'View',
	'Views',
	'ClickEvent',
	'Click',
	'File',
	'AdminFile',
	'Upload',
	'Counter',
	'Session',
	'Log',
]);

/** `businessName` -> `Business Name`, for when settings carry no title. */
const prettify = (field: string) =>
	field
		.replace(/[._]/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/^./, c => c.toUpperCase())
		.trim();

/** `AdminInvoice` -> `admin invoice`, so it reads inside a sentence. */
const modelLabel = (model: string) =>
	model
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.trim();

/**
 * A value as it should read in a sentence.
 *
 * Everything is flattened to a string on the way in rather than resolved on the
 * way out: an ObjectId that pointed at a since-deleted document would render as
 * nothing years later, and the whole point of the log is that it still reads.
 */
const describe = (value: any): string => {
	if (value === undefined || value === null || value === '') return 'empty';
	if (Array.isArray(value)) return value.length ? value.map(describe).join(', ') : 'empty';
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'boolean') return value ? 'yes' : 'no';

	if (typeof value === 'object') {
		// A populated ref, or a raw ObjectId.
		if (value.name) return String(value.name);
		if (value.title) return String(value.title);
		if (value.code) return String(value.code);
		return String(value._id ?? value);
	}

	return String(value);
};

/** What to call the affected record in the sentence. */
const documentName = (doc: any): string =>
	doc?.name || doc?.title || doc?.subject || doc?.invoiceNumber || '';

/** The route segment the record is served under, e.g. `/admin/api/meetings`. */
const pathFromRequest = (req: any): string => {
	const base = String(req?.baseUrl || '');
	const segments = base.split('/').filter(Boolean);
	return segments[segments.length - 1] || '';
};

type DiffArgs = {
	before: Record<string, any>;
	after: Record<string, any>;
	fields: string[];
	settings?: Record<string, any>;
};

/**
 * Field-level diff, limited to the fields the request actually submitted.
 *
 * Comparison is on the *rendered* strings rather than the raw values, which is
 * what stops an unchanged `ObjectId` or `Date` being reported as an edit just
 * because the two instances aren't `===`.
 */
export const diffFields = ({ before, after, fields, settings }: DiffArgs): HistoryChange[] => {
	const changes: HistoryChange[] = [];

	for (const field of fields) {
		const from = describe(before?.[field]);
		const to = describe(after?.[field]);
		if (from === to) continue;

		changes.push({
			field,
			label: settings?.[field]?.title || prettify(field),
			from,
			to,
		});
	}

	return changes;
};

type TextArgs = {
	userName: string;
	action: HistoryAction;
	model: string;
	doc: any;
	changes: HistoryChange[];
};

/**
 * The sentence stored on the entry.
 *
 * Rendered once, at write time, rather than assembled by the reader: the names
 * and codes it quotes are the ones that were true when it happened, and a
 * plain string is also what makes the log searchable.
 */
export const buildHistoryText = ({
	userName,
	action,
	model,
	doc,
	changes,
}: TextArgs): string => {
	const name = documentName(doc);
	const code = doc?.code ? String(doc.code) : '';
	const subject = `${modelLabel(model)}${name ? ` ${name}` : ''}${code ? ` #${code}` : ''}`;

	if (action === 'create') return `${userName} created ${subject}`;
	if (action === 'delete') return `${userName} deleted ${subject}`;

	if (changes.length === 1) {
		const { label, from, to } = changes[0];
		return `${userName} updated ${label} from ${from} to ${to} for ${subject}`;
	}

	const labels = changes.map(c => c.label).join(', ');
	return `${userName} updated ${changes.length} fields (${labels}) for ${subject}`;
};

type RecordArgs = {
	req: any;
	action: HistoryAction;
	model: string;
	doc: any;
	changes?: HistoryChange[];
};

/**
 * Write one history entry.
 *
 * Deliberately fire-and-forget and never throws: an audit trail is not worth
 * failing a save the user already completed, so a broken write is logged and
 * swallowed. Callers do not await it.
 */
export const recordHistory = ({ req, action, model, doc, changes = [] }: RecordArgs): void => {
	try {
		if (!doc || SKIP_MODELS.has(model)) return;

		// An update that changed nothing is not worth an entry.
		if (action === 'update' && changes.length === 0) return;

		const userName = req?.user?.name || req?.user?.username || 'Someone';
		const text = buildHistoryText({ userName, action, model, doc, changes });

		History.create({
			user: req?.user?._id,
			userName,
			action,
			model,
			modelPath: pathFromRequest(req),
			document: doc?._id,
			documentName: documentName(doc),
			documentCode: doc?.code ? String(doc.code) : '',
			text,
			changes,
			shop: req?.shop,
		}).catch((e: any) => console.error('History write failed:', e?.message));
	} catch (e: any) {
		console.error('History write failed:', e?.message);
	}
};

export default recordHistory;
