import { Response } from 'express';
import mongoose from 'mongoose';
import History from '../../models/history/model.js';

/**
 * One record's own timeline, newest first.
 *
 * Served at `/history/g/document/:id` and read by the view drawer, so opening a
 * meeting shows what was done to that meeting rather than sending the reader to
 * the global page to filter for it.
 */
const getDocumentHistory = async (req: any, res: Response): Promise<Response> => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: 'Invalid Document ID' });
		}

		const limit = Math.min(Number(req.query.limit) || 50, 200);

		const doc = await History.find({ document: id })
			.sort({ createdAt: -1 })
			.limit(limit)
			.populate('user', 'name email');

		return res.status(200).json({ doc, docsInPage: doc.length });
	} catch (e: any) {
		console.error(e?.message);
		return res.status(500).json({ message: e?.message || 'Internal Server Error' });
	}
};

export default getDocumentHistory;
