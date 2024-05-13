import { Response } from 'express';
import { ProtectedRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';

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

type RequestType = ProtectedRequestType & {
	queryHelper?: any;
	store?: any;
	meta?: any;
};

const getPublicDocuments = ({ model, populate, select = '' }: EndwareType) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const { sort, limit = 10, skip = 0, fields }: Meta = req.meta;
			let query: any = req?.queryHelper || {};

			const listQuery = model
				.find(query)
				.populate(populate || '')
				.select(select || fields)
				.sort(sort)
				.limit(limit)
				.skip(skip);

			const doc = await listQuery.exec();
			const count: number = await model.countDocuments(query);

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

export default getPublicDocuments;
