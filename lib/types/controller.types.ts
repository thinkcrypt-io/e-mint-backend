import { Request } from 'express';
import { Types } from 'mongoose';

export type GetRequestType = Request & {
	user?: any;
};

export type ProtectedRequestType = Request & {
	user?: any;
};

export type GetByIdRequestType = Request & {
	params: {
		id: string;
	};
};

export type MetaType = {
	search: string;
	sort: string;
	page: any;
	limit: any;
	skip: number;
	query: any;
	docsInPage?: number;
	totalDocs?: number;
	totalPages?: number;
	fields: string;
};
