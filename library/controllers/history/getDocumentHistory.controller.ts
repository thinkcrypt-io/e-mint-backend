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

		// The view page's History tab loads more by raising `limit` (one query,
		// so a refetch after an edit returns the whole visible trail fresh), hence
		// the high ceiling. `page` is there for callers that want real paging.
		const limit = Math.min(Number(req.query.limit) || 50, 1000);
		const page = Math.max(Number(req.query.page) || 1, 1);

		const [doc, totalDocs] = await Promise.all([
			History.find({ document: id })
				.sort({ createdAt: -1 })
				.skip((page - 1) * limit)
				.limit(limit)
				.populate('user', 'name email'),
			History.countDocuments({ document: id }),
		]);

		return res.status(200).json({
			doc,
			docsInPage: doc.length,
			totalDocs,
			page,
			totalPages: Math.ceil(totalDocs / limit),
		});
	} catch (e: any) {
		console.error(e?.message);
		return res.status(500).json({ message: e?.message || 'Internal Server Error' });
	}
};

export default getDocumentHistory;
