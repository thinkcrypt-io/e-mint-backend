import { Response, Request } from 'express';
import mongoose from 'mongoose';
import { applyFormulasLinked, recalculateFormulas } from '../../library/functions/formula.function.js';
import { recalculateDependents } from '../../library/functions/formulaDependents.function.js';
import { hasLinkedRules, linkedFailure, linkedMany } from '../../library/functions/linkedRelationships.function.js';
import recordHistory, { diffFields } from '../../library/functions/recordHistory.function.js';
import { lockedChanges, lockedMessage } from '../../library/functions/fieldLocks.function.js';

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

			// Conditional read-only: refused when any selected record has the field locked.
			if (updateKeys.some(k => settings?.[k]?.lockWhen?.length)) {
				const current = await model.find({ _id: { $in: ids }, store: req.store }).lean();
				for (const d of current) {
					const locked = lockedChanges(settings, d, updates);
					if (locked.length)
						return res
							.status(400)
							.json({ message: `${lockedMessage(locked)} — on at least one of the selected records`, locked });
				}
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

			// Linked Relationships: each record as it will be, checked before anything is written.
			const linked = hasLinkedRules(req)
				? await linkedMany(
						req,
						model,
						await Promise.all(before.map(async (b: any) => {
							const doc: any = model.hydrate({ ...b });
							for (const k of updateKeys)
								if (keyType === 'array') doc.set(k, [...(doc.get(k) || []), ...(Array.isArray(updates[k]) ? updates[k] : [updates[k]])]);
								else doc.set(k, updates[k]);
							await applyFormulasLinked(doc, req.formulas, model);
							return { action: 'update' as const, before: b, after: doc.toObject(), label: String(b.name || b.title || b.code || b._id) };
						}))
				  )
				: null;
			if (linked?.error) return res.status(400).json(linked.error);

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
			if (req.formulas?.length) await recalculateFormulas(model, { _id: { $in: ids }, store: req.store }, req.formulas);

			if (result.modifiedCount === 0) {
				return res.status(404).json({ message: 'No documents found or updated' });
			}

			const beforeById = new Map(before.map((doc: any) => [String(doc._id), doc]));
			const fields = [...updateKeys, ...(req.formulas || []).map((f: any) => f.key)];
			const after = await model.find(scope);

			let also: any[] = [];
			if (linked?.any)
				try {
					const byId = new Map(after.map((d: any) => [String(d._id), d]));
					also = await linked.apply(before.map((b: any) => byId.get(String(b._id))));
				} catch (e) {
					// The records go back to how they were, with the rest.
					for (const b of before as any[]) await model.collection.replaceOne({ _id: b._id }, b);
					return linkedFailure(res, e);
				}
			// Records whose formulas read these through a link (`tax.amount`).
			await recalculateDependents(req.app, model, after.map((d: any) => d._id), fields);
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

			return res.status(200).json({ message: 'Batch Update Completed', result, ...(also.length > 0 && { linked: also }) });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default updateManyDocuments;
