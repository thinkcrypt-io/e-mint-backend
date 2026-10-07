import { Response, Request } from 'express';
import mongoose from 'mongoose';
import { lockedChanges, lockedMessage } from '../../functions/fieldLocks.function.js';

type EndwareType = {
	model: mongoose.Model<any>;
	select?: string;
	allowEdits: string[];
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

			console.log('keyType:', keyType);

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

			if (result.modifiedCount === 0) {
				return res.status(404).json({ message: 'No documents found or updated' });
			}

			return res.status(200).json({ message: 'Batch Update Completed', result });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default updateManyDocuments;
