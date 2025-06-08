import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';

// Define the options type for the getDocumentByCode function.
type EndwareType = {
	model: mongoose.Model<any>; // The Mongoose model to query.
	populate?: any; // Optional: instructions for populating referenced fields.
	select?: string; // Optional: fields to include in the result.
	exclude?: string; // Optional: fields to exclude from the result.
};

const getDocumentByCode = ({ model, populate, select, exclude }: EndwareType) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			// Extract the 'code' from the request parameters.
			const { code } = req.params;

			// Validate that the code is provided and not empty.
			if (!code || code.trim() === '') {
				return res.status(400).json({ message: 'Code parameter is required.' });
			}

			// Check if the model schema has a 'code' field
			const schemaFields = Object.keys(model.schema.paths);
			if (!schemaFields.includes('code')) {
				return res.status(400).json({
					message:
						'This model does not support code-based queries. Code field not found in schema.',
				});
			}

			// Retrieve any additional query filters set by earlier middleware (if available).
			const queryHelper = (req as any).queryHelper || {};

			// Ensure the query includes filtering by the provided code (convert to uppercase for consistency).
			queryHelper.code = code.trim().toUpperCase();

			// Build the Mongoose query to find one document matching the query helper criteria.
			let query = model.findOne(queryHelper);

			// If a 'populate' option is provided, apply population to the query.
			if (populate) query = query.populate(populate);

			// If a 'select' option is provided, apply it to the query for field selection.
			if (select) query = query.select(select);

			// If an 'exclude' option is provided, apply it to the query for field exclusion.
			if (exclude) query = query.select(exclude);

			// Execute the query to retrieve the document from the database.
			const data = await query.exec();

			// If no document is found, return a 404 Not Found response.
			if (!data) {
				return res.status(404).json({ message: 'Document with the provided code not found.' });
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

export default getDocumentByCode;
