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

const getStaffInventory = ({
	model,
	populate,
	select = '',
	exclude,
}: EndwareType & { exclude?: any }) => {
	return async (req: RequestType, res: Response): Promise<Response> => {
		try {
			const { sort, limit = 10, skip = 0, fields }: Meta = req.meta;
			// const location = req.query['inventory.location'];
			let query: any = req?.queryHelper || {};

			// if (!location) {
			// 	return res.status(400).json({ message: 'Location is required' });
			// }

			const listQuery = model
				.find(query)
				.populate(populate || '')
				.select(select || (fields && `${fields} ${exclude && exclude}`) || (exclude && exclude))
				.sort(sort)
				.limit(limit)
				.skip(skip);

			const doc = await listQuery.exec();
			const count: number = await model.countDocuments(query);

			// Calculate receivedStock and stockInTransit for each document
			const updatedDocs = doc.map((document: any) => {
				const inventoryItem = document.inventory.find(
					(inv: any) => inv.location._id.toString() === location
				);
				const receivedStock = inventoryItem ? inventoryItem.stock : 0;
				const incomingStock = inventoryItem ? inventoryItem.incomingStock : 0;
				const stockInHand = inventoryItem ? inventoryItem.stock : 0;

				return {
					...document.toObject(),
					receivedStock,
					incomingStock,
					stockInHand,
				};
			});

			req.meta.docsInPage = doc.length;
			req.meta.totalDocs = count;
			req.meta.totalPages = Math.ceil(count / limit);

			return res.status(200).json({ ...req.meta, doc: updatedDocs });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getStaffInventory;
