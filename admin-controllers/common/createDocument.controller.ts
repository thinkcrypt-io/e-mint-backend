import { Response } from 'express';
import { displayModelName } from '../../library/functions/routeRegistry.function.js';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';
import recordHistory from '../../library/functions/recordHistory.function.js';
import { applyFormulas } from '../../library/functions/formula.function.js';
import { hasLinkedRules, linkedFailure, linkedFor } from '../../library/functions/linkedRelationships.function.js';

const createDocument = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const document = new model({ ...req.body, addedBy: req.user._id });
			// Formula fields, from the values just set (and the model's defaults).
			applyFormulas(document, req.formulas);
			// Fields hidden by the form's conditions aren't required (formRules.function.ts).
			const hidden: string[] = req.formHidden || [];
			// Linked Relationships: what saving this changes in the records it picks,
			// worked out from the checked record before anything is written.
			const rules = hasLinkedRules(req);
			if (hidden.length || rules) await document.validate(hidden.length ? { pathsToSkip: hidden } : undefined);
			const plan = rules ? await linkedFor(req, model, 'create', null, document.toObject()) : null;
			if (plan?.error) return res.status(400).json(plan.error);
			const saved = await document.save(hidden.length || rules ? { validateBeforeSave: false } : undefined);

			let also: any[] = [];
			if (plan)
				try {
					also = await plan.apply(saved);
				} catch (e) {
					await model.collection.deleteOne({ _id: saved._id });
					return linkedFailure(res, e);
				}

			recordHistory({ req, action: 'create', model: model.modelName, doc: saved });

			return res.status(201).json({
				message: `${displayModelName(model.modelName)} with id: ${saved._id} added successfully`,
				doc: saved,
				...(also.length > 0 && { linked: also }),
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
