import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';
import recordHistory from '../../library/functions/recordHistory.function.js';
import { hasLinkedRules, linkedFailure, linkedFor } from '../../library/functions/linkedRelationships.function.js';
import { recalculateDependents } from '../../library/functions/formulaDependents.function.js';

const deleteDocument = (model: mongoose.Model<any>) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			const { id } = req.params;

			// Validate that the provided 'id' is a valid MongoDB ObjectId.
			if (!mongoose.Types.ObjectId.isValid(id)) {
				return res.status(400).json({ message: 'Invalid Document ID' });
			}

			// Linked Relationships: what deleting this does to the records it
			// changed or picks — taken back, left, or the delete refused.
			let plan: any = null;
			let raw: any = null;
			if (hasLinkedRules(req)) {
				const current = await model.findById(id);
				if (!current) return res.status(404).json({ message: 'Document Not Found' });
				raw = await model.collection.findOne({ _id: current._id });
				plan = await linkedFor(req, model, 'delete', current.toObject(), null);
				if (plan?.error) return res.status(400).json(plan.error);
			}

			// Attempt to delete the document with the given ID.
			const data = await model.findByIdAndDelete(id);

			// If no document was deleted, throw a 404 error.
			if (!data) {
				return res.status(404).json({ message: 'Document Not Found' });
			}

			let also: any[] = [];
			if (plan)
				try {
					also = await plan.apply(data);
				} catch (e) {
					if (raw) await model.collection.insertOne(raw);
					return linkedFailure(res, e);
				}

			// Records whose formulas read this one through a link: it reads as 0 now.
			await recalculateDependents(req.app, model, [data._id]);

			// `findByIdAndDelete` hands back the document as it was, which is the
			// only chance to record what was removed — after this it is gone.
			recordHistory({ req, action: 'delete', model: model.modelName, doc: data });

			// Respond with a success message if deletion was successful.
			return res.status(200).json({ message: `Document Deleted Successfully`, id: id, ...(also.length > 0 && { linked: also }) });
		} catch (error: any) {
			// In case of any errors,
			// extract the error message and return a 500 Internal Server Error response.
			const message = getErrorMessage(error);
			return res.status(500).json({ message });
		}
	};
};

export default deleteDocument;
