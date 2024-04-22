import { Request, Response, NextFunction } from 'express';
import { MetaType } from '../lib/types/controller.types';

type RequestType = Request & {
	search?: string;
	sort?: string;
	page?: number;
	limit?: number;
	skip?: number;
	meta?: MetaType;
	query: MetaType;
	fields?: any;
};

const PAGE_LIMIT = 10;

const pagination = async (
	req: RequestType,
	res: Response,
	next: NextFunction
): Promise<Response | void> => {
	try {
		const { sort = '-createdAt', search = '', query = '' } = req.query;
		const page: number = req.query.page && req.query.page > 0 ? parseInt(req.query.page) : 1;
		const limit: number = req.query.limit ? parseInt(req.query.limit) : PAGE_LIMIT;
		const skip: number = (page - 1) * limit;

		const queryFields = req.query.fields;

		const fields =
			queryFields && typeof queryFields == 'string' ? queryFields?.split(',').join(' ') : '';
		// Construct the query options for selective fields

		req.meta = {
			search,
			sort,
			page,
			limit,
			skip,
			query,
			fields,
		};

		next();
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};

export default pagination;
