import { Response } from 'express';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';
import recordHistory from '../../library/functions/recordHistory.function.js';
import { applyFormulas } from '../../library/functions/formula.function.js';

const createDocument = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const document = new model({ ...req.body, addedBy: req.user._id });
			// Formula fields, from the values just set (and the model's defaults).
			applyFormulas(document, req.formulas);
			// Fields hidden by the form's conditions aren't required (formRules.function.ts).
			const hidden: string[] = req.formHidden || [];
			if (hidden.length) await document.validate({ pathsToSkip: hidden });
			const saved = await document.save(hidden.length ? { validateBeforeSave: false } : undefined);

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
