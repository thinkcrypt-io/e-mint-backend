import { Response } from 'express';
import mongoose from 'mongoose';

const getFiles =
	({ model }: { model: mongoose.Model<any> }) =>
	async (req: any, res: Response) => {
		try {
			const { sort, limit = 10, skip = 0, fields, page }: any = req.meta;
			const { type = 'image', folder } = req.query;
			let query: any = { fileType: type };
			if (folder) query.folder = folder;

			const doc = await model.find(query).sort('-createdAt').limit(limit).skip(skip);

			const count: number = await model.countDocuments(query);

			req.meta.docsInPage = doc.length;
			req.meta.totalDocs = count;
			req.meta.totalPages = Math.ceil(count / limit);

			return res.status(200).json({ message: 'Files fetched successfully', doc, ...req.meta });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};

export default getFiles;
