import { Response } from 'express';
import mongoose from 'mongoose';
import recordHistory, { diffFields } from '../../functions/recordHistory.function.js';

type EndwareType = {
	model: mongoose.Model<any>;
	select?: string;
	allowEdits: string[];
	/** The model's settings, used only to title the changed fields in the
	 *  history entry (`category` -> `Category`). Optional: callers that predate
	 *  the history log still work, the field name is just prettified instead. */
	settings?: Record<string, any>;
};

const updateDocument = ({ model, allowEdits, settings }: EndwareType) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const { id } = req.params;

			let data: any = await model.findOne({ _id: id, shop: req.shop });

			if (!data) {
				return res.status(404).json({ message: 'Document Not Found' });
			}

			const updates = Object.keys(req.body);
			const isValidOperation = updates.every(update => allowEdits.includes(update));

			if (!isValidOperation) {
				const invalidUpdates = updates.filter(update => !allowEdits.includes(update));
				return res.status(400).json({
					message: `Invalid fields: '${invalidUpdates.join(', ')}' not allowed`,
				});
			}

			// Snapshot before the assignments below mutate `data` in place —
			// after them there is nothing left to compare the new values against.
			const before = data.toObject();

			updates.forEach((update: any) => (data[update] = req.body[update]));

			const saved = await data.save();

			recordHistory({
				req,
				action: 'update',
				model: model.modelName,
				doc: saved,
				changes: diffFields({
					before,
					after: saved.toObject(),
					// Only what this request actually submitted: comparing every path
					// would report timestamps and defaults as user edits.
					fields: updates,
					settings,
				}),
			});

			return res.status(200).json({ message: 'Information Updated Successfylly', doc: saved });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default updateDocument;
