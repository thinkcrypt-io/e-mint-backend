import { Request, Response } from 'express';
import { PdfCategory, PdfTemplate } from '../../models/pdf-templates/_index.js';
import { currentScope, withoutScope } from '../../functions/tenantScope.function.js';
import { categoryKey } from '../../functions/pdfTemplates/schema.js';

/**
 * Gallery categories (docs/pdf-templates D21): one global list, read by
 * everyone signed in, kept by the super admin. Seeded with Invoices,
 * Receipts and Quotations the first time it's read.
 */

export type PdfCategoryData = { key: string; name: string; description: string; order: number };

export const DEFAULT_CATEGORIES: PdfCategoryData[] = [
	{ key: 'invoice', name: 'Invoices', description: 'What a customer owes you — for work done or goods sold.', order: 0 },
	{ key: 'receipt', name: 'Receipts', description: 'Proof of money received.', order: 1 },
	{ key: 'quotation', name: 'Quotations', description: 'A price offer before the work starts.', order: 2 },
];

const shape = (c: any): PdfCategoryData => ({ key: c.key, name: c.name, description: c.description || '', order: c.order ?? 0 });

export const loadCategories = async (): Promise<PdfCategoryData[]> =>
	withoutScope(async () => {
		let list: any[] = await PdfCategory.find().sort({ order: 1, name: 1 }).lean();
		if (!list.length) {
			// Two first reads at once: the unique key keeps one of each.
			await PdfCategory.insertMany(DEFAULT_CATEGORIES, { ordered: false }).catch(() => {});
			list = await PdfCategory.find().sort({ order: 1, name: 1 }).lean();
		}
		return list.map(shape);
	});

/** Only the super admin keeps the categories (not inside a project). */
export const keepsGallery = () => !currentScope();

/** Adds or changes a category ({ key, name, description, order }) — the super admin's. */
export const saveCategory = async (raw: any): Promise<{ category?: PdfCategoryData; error?: string }> => {
	if (!keepsGallery()) return { error: 'Only the super admin keeps the gallery’s categories' };
	const name = String(raw?.name ?? '').trim().slice(0, 60);
	const key = categoryKey(raw?.key || name);
	if (!key) return { error: 'Give the category a name' };
	await loadCategories();
	const existing: any = await withoutScope(() => PdfCategory.findOne({ key }).lean());
	if (!existing && !name) return { error: 'Give the category a name' };
	const count = await withoutScope(() => PdfCategory.countDocuments());
	if (!existing && count >= 50) return { error: 'There can be at most 50 categories' };
	const set: any = {
		...(name && { name }),
		...(raw?.description !== undefined && { description: String(raw.description).trim().slice(0, 300) }),
		...(raw?.order !== undefined && Number.isFinite(Number(raw.order)) && { order: Math.max(0, Math.min(999, Math.round(Number(raw.order)))) }),
	};
	if (!existing && set.order === undefined) set.order = count;
	const doc = await withoutScope(() => PdfCategory.findOneAndUpdate({ key }, { $set: set, $setOnInsert: { key } }, { upsert: true, new: true }).lean());
	return { category: shape(doc) };
};

/** Removes a category; its templates stay, shown under "Other". */
export const removeCategory = async (key: string): Promise<{ removed?: number; error?: string }> => {
	if (!keepsGallery()) return { error: 'Only the super admin keeps the gallery’s categories' };
	const r = await withoutScope(() => PdfCategory.deleteOne({ key: categoryKey(key) }));
	return { removed: r.deletedCount || 0 };
};

/* -------------------------------------------------------------- routes */

export const listCategories = async (_req: Request, res: Response) => {
	const categories = await loadCategories();
	return res.status(200).json({ categories, canEdit: keepsGallery() });
};

export const putCategory = async (req: Request, res: Response) => {
	const r = await saveCategory({ ...req.body, ...(req.params.key && { key: req.params.key }) });
	if (r.error) return res.status(keepsGallery() ? 400 : 403).json({ message: r.error });
	return res.status(200).json(r.category);
};

export const deleteCategory = async (req: Request, res: Response) => {
	const r = await removeCategory(String(req.params.key || ''));
	if (r.error) return res.status(403).json({ message: r.error });
	const left = await withoutScope(() => PdfTemplate.countDocuments({ 'gallery.published': true, kind: categoryKey(req.params.key) }));
	return res.status(200).json({ removed: r.removed, templatesLeft: left });
};
