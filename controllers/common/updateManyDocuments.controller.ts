import { Response, Request } from 'express';
import mongoose from 'mongoose';
import { formulaPipeline } from '../../library/functions/formula.function.js';
import recordHistory, { diffFields } from '../../library/functions/recordHistory.function.js';

type EndwareType = {
	model: mongoose.Model<any>;
	select?: string;
	allowEdits: string[];
	/** Titles the changed fields in the history entries, as in updateDocument. */
	settings?: Record<string, any>;
};

const updateManyDocuments = ({ model, allowEdits, settings }: EndwareType) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const { ids, updates, type: keyType = 'string' } = req.body;

			if (!Array.isArray(ids) || ids.length === 0) {
				return res.status(400).json({ message: 'Invalid or missing IDs array' });
			}

			const updateKeys = Object.keys(updates);
			const isValidOperation = updateKeys.every(update => allowEdits.includes(update));

			if (!isValidOperation) {
				const invalidUpdates = updateKeys.filter(update => !allowEdits.includes(update));
				return res.status(400).json({
					message: `Invalid fields: '${invalidUpdates.join(', ')}' not allowed`,
				});
			}

			const updateData: any = {};
			let itemType = 'string';
			updateKeys.forEach((update: any) => {
				if (Array?.isArray(updates[update])) {
					updateData[update] = { $push: { $each: updates[update] } };
					itemType = 'array';
				} else {
					updateData[update] = updates[update];
				}
			});

			let result;

			// `updateMany` returns counts, not documents, so snapshot the records
			// first — each one gets its own history entry with a before/after diff,
			// exactly as if it had been edited on its own.
			const scope = { _id: { $in: ids }, store: req.store };
			const before = await model.find(scope).lean();

			if (keyType === 'array') {
				result = await model.updateMany(
					{ _id: { $in: ids }, store: req.store },
					{ $push: updateData }, // Use $push instead of $set for array updates
					{ multi: true }
				);
			} else {
				result = await model.updateMany(
					{ _id: { $in: ids }, store: req.store },
					{ $set: updateData },
					{ multi: true }
				);
			}

			// Formula fields of the records just changed, recalculated in the database.
			if (req.formulas?.length)
				await model.updateMany({ _id: { $in: ids }, store: req.store }, formulaPipeline(req.formulas));

			if (result.modifiedCount === 0) {
				return res.status(404).json({ message: 'No documents found or updated' });
			}

			const beforeById = new Map(before.map((doc: any) => [String(doc._id), doc]));
			const fields = [...updateKeys, ...(req.formulas || []).map((f: any) => f.key)];
			const after = await model.find(scope);
			after.forEach((doc: any) =>
				recordHistory({
					req,
					action: 'update',
					model: model.modelName,
					doc,
					changes: diffFields({
						before: beforeById.get(String(doc._id)) || {},
						after: doc.toObject(),
						fields,
						settings,
					}),
				})
			);

			return res.status(200).json({ message: 'Batch Update Completed', result });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default updateManyDocuments;
