import { Response } from 'express';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';
import recordHistory from '../../library/functions/recordHistory.function.js';

const createDocument = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const document = new model({ ...req.body, addedBy: req.user._id });
			const saved = await document.save();

			recordHistory({ req, action: 'create', model: model.modelName, doc: saved });

			return res.status(201).json({
				message: `${model.modelName} with id: ${saved._id} added successfully`,
				doc: saved,
			});
		} catch (e: any) {
			console.error(e);
			const message = getErrorMessage(e);
			// A value the model refuses is the request's fault, not the server's.
			const invalid = e instanceof mongoose.Error.ValidationError || e instanceof mongoose.Error.CastError;
			return res.status(invalid ? 400 : 500).json({ message });
		}
	};
};

export default createDocument;
