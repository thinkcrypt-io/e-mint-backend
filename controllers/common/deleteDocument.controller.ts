import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';

const deleteDocument = (model: mongoose.Model<any>) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			const { id } = req.params;

			// Validate that the provided 'id' is a valid MongoDB ObjectId.
			if (!mongoose.Types.ObjectId.isValid(id)) {
				return res.status(400).json({ message: 'Invalid Document ID' });
			}

			// Attempt to delete the document with the given ID.
			const data = await model.findByIdAndDelete(id);

			// If no document was deleted, throw a 404 error.
			if (!data) {
				return res.status(404).json({ message: 'Document Not Found' });
			}

			// Respond with a success message if deletion was successful.
			return res.status(200).json({ message: `Document Deleted Successfully`, id: id });
		} catch (error: any) {
			// In case of any errors,
			// extract the error message and return a 500 Internal Server Error response.
			const message = getErrorMessage(error);
			return res.status(500).json({ message });
		}
	};
};

export default deleteDocument;
