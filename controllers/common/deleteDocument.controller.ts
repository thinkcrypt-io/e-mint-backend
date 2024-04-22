import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';

const deleteDocument = (model: mongoose.Model<any>) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			const { id } = req.params;
			const data = await model.findByIdAndDelete(id);

			if (!data) {
				return res.status(404).json({ message: 'Document Not Found' });
			}

			return res.status(200).json({ message: 'Document Deleted Successfully' });
		} catch (e: any) {
			console.error(e.message);
			const message = process.env.NODE_ENV === 'development' ? e?.message : 'Internal Server Error';
			return res.status(500).json({ message: message });
		}
	};
};

export default deleteDocument;
