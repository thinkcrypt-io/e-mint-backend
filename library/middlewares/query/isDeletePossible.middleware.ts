import { NextFunction, Response } from 'express';
import mongoose from 'mongoose';

type IsDeletePossibleType = { model: mongoose.Model<any>; field?: string; error?: string };

const BAD_ID = 'Invalid Document ID';
const BAD_REQUEST = 'Cannot delete this entry as it is being used in other documents';

const isDeletePossible = ({ model, field, error }: IsDeletePossibleType) => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			if (!field) return next();

			const { id } = req.params;

			// Validate that the provided 'id' is a valid MongoDB ObjectId.
			if (!mongoose.Types.ObjectId.isValid(id)) {
				return res.status(400).json({ message: BAD_ID });
			}

			const existingEntry = await model.findOne({ [field]: id });

			// If the entry is found, return a 400 Bad Request response.
			if (existingEntry) {
				return res.status(400).json({
					message: error || BAD_REQUEST,
				});
			}
			next();
		} catch (error: any) {
			// In case of any errors,
			// extract the error message and return a 500 Internal Server Error response.
			const message = error.message || 'Internal Server Error';
			return res.status(500).json({ message });
		}
	};
};

export default isDeletePossible;
