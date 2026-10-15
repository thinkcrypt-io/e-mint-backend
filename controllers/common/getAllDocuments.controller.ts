import { Response } from 'express';
import mongoose from 'mongoose';
import { statusOf } from '../../library/functions/drafts.function.js';
import { PUBLISH_STATUSES } from '../../library/functions/dynamicModels.function.js';

type EndwareType = {
	model: mongoose.Model<any>;
	populate?: any;
	select?: string;
};

type Meta = {
	sort?: string;
	limit: number;
	skip: number;
	fields: string;
	docsInPage?: number;
	totalDocs?: number;
	totalPages?: number;
};

const getAllDocuments = ({
	model,
	populate,
	select = '',
	exclude,
}: EndwareType & { exclude?: any }) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const { sort, limit = 10, skip = 0, fields }: Meta = req.meta;
			let query: any = req?.queryHelper || {};

			// query.restaurant = req.restaurant;

			const listQuery = model
				.find(query)
				.populate(populate || '')
				.select(select || (fields && `${fields} ${exclude && exclude}`) || (exclude && exclude))
				.sort(sort)
				.limit(limit)
				.skip(skip);

			let doc: any[] = await listQuery.exec();
			const count: number = await model.countDocuments(query);

			// A drafts model's rows say where each stands (docs/cms D5, CMS-07) — read apart, whatever `fields` picked.
			if (doc.length && model.schema.path('_publishedFrom')) {
				const dates: any[] = await model.find({ _id: { $in: doc.map(d => d._id) } }, { _publishedAt: 1, _publishedFrom: 1, updatedAt: 1 }).lean();
				const by = new Map(dates.map(d => [String(d._id), statusOf(d)]));
				const label: Record<string, string> = Object.fromEntries(PUBLISH_STATUSES);
				doc = doc.map(d => ({ ...(typeof d.toJSON === 'function' ? d.toJSON() : d), _status: label[by.get(String(d._id)) || 'draft'] }));
			}

			req.meta.docsInPage = doc.length;
			req.meta.totalDocs = count;
			req.meta.totalPages = Math.ceil(count / limit);

			return res.status(200).json({ ...req.meta, doc: doc });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getAllDocuments;
