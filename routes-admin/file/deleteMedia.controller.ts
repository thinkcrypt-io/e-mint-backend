import { Response } from 'express';
import mongoose from 'mongoose';
import { deleteS3ObjectIfUnused } from './media.helpers.js';

// Permanent delete of one File document. The S3 object goes only once no other
// File document shares its key (a legacy "Make Copy" pointed two documents at
// one object, and deleting either used to break the other).
const deleteMedia = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response) => {
		try {
			const file = await model.findById(req.params.id);

			if (!file) {
				return res.status(404).json({ message: 'File not found in database' });
			}

			await model.findByIdAndDelete(file._id);
			await deleteS3ObjectIfUnused(file.key, file.bucket);

			return res.status(200).json({ message: 'File deleted successfully', key: file.key });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default deleteMedia;
