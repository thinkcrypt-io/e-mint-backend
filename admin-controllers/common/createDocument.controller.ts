import { Response } from 'express';
import { displayModelName } from '../../library/functions/routeRegistry.function.js';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';
import recordHistory from '../../library/functions/recordHistory.function.js';
import { applyFormulasLinked } from '../../library/functions/formula.function.js';
import { hasLinkedRules, linkedFailure, linkedFor } from '../../library/functions/linkedRelationships.function.js';
import { booksFailure, booksFor } from '../../library/functions/accounting/engine.js';

const createDocument = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const document = new model({ ...req.body, ...(req.autofilled || {}), addedBy: req.user._id });
			// Formula fields, from the values just set (and the model's defaults).
			await applyFormulasLinked(document, req.formulas, model);
			// Fields hidden by the form's conditions aren't required (formRules.function.ts).
			const hidden: string[] = req.formHidden || [];
			// Linked Relationships: what saving this changes in the records it picks,
			// worked out from the checked record before anything is written.
			const rules = hasLinkedRules(req);
			if (hidden.length || rules) await document.validate(hidden.length ? { pathsToSkip: hidden } : undefined);
			const plan = rules ? await linkedFor(req, model, 'create', null, document.toObject()) : null;
			if (plan?.error) return res.status(400).json(plan.error);
			// The books (docs/accounting AC-03): a posting document is checked before it is saved.
			const books = await booksFor(req, model, 'create', null, document.toObject());
			if (books?.error) return res.status(400).json(books.error);
			const saved = await document.save(hidden.length || rules ? { validateBeforeSave: false } : undefined);

			let also: any[] = [];
			if (plan)
				try {
					also = await plan.apply(saved);
				} catch (e) {
					await model.collection.deleteOne({ _id: saved._id });
					return linkedFailure(res, e);
				}

			if (books?.apply)
				try {
					const posted = await books.apply(saved);
					// What the books set on it (status, cost of goods), in the answer too.
					if (posted?.patch) saved.set(posted.patch);
				} catch (e) {
					await model.collection.deleteOne({ _id: saved._id });
					return booksFailure(res, e);
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
			// …and so is a model's own refusal that says so (a single type's second record, docs/cms D2).
			const status = typeof e?.status === 'number' && e.status >= 400 && e.status < 500 ? e.status : invalid ? 400 : 500;
			return res.status(status).json({ message });
		}
	};
};

export default createDocument;
