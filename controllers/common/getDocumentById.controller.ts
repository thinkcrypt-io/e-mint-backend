import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';

// Define the options type for the getDocumentById function.
type EndwareType = {
	model: mongoose.Model<any>; // The Mongoose model to query.
	populate?: any; // Optional: instructions for populating referenced fields.
	select?: string; // Optional: fields to include in the result.
	exclude?: string; // Optional: fields to exclude from the result.
};

const getDocumentById = ({ model, populate, select, exclude }: EndwareType) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			// Extract the 'id' from the request parameters.
			const { id } = req.params;

			// Validate that the id is a valid MongoDB ObjectId.
			if (!mongoose.Types.ObjectId.isValid(id))
				return res.status(400).json({ message: 'Invalid document ID format.' });

			// Retrieve any additional query filters set by earlier middleware (if available).
			const queryHelper = (req as any).queryHelper || {};

			// Ensure the query includes filtering by the provided id.
			queryHelper._id = id;

			// Build the Mongoose query to find one document matching the query helper criteria.
			let query = model.findOne(queryHelper);

			// If a 'populate' option is provided, apply population to the query.
			if (populate) query = query.populate(populate);

			// If an 'exclude' option is provided, apply it to the query for field selection.
			if (exclude) query = query.select(exclude && exclude);

			// Execute the query to retrieve the document from the database.
			const data = await query.exec();

			// If no document is found, return a 404 Not Found response.
			if (!data) {
				return res.status(404).json({ message: 'Document Not Found' });
			}

			// If a document is found, return it with a 200 OK response.
			return res.status(200).json(data);
		} catch (error: any) {
			// In case of any errors,
			// extract the error message and return a 500 Internal Server Error response.
			const message = getErrorMessage(error);
			return res.status(500).json({ message });
		}
	};
};

export default getDocumentById;
