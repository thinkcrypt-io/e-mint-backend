import mongoose from 'mongoose';
import { Response } from 'express';

const updateSelfController =
	({ model }: { model: mongoose.Model<any> }) =>
	async (req: any, res: Response): Promise<Response> => {
		const allowEdits = ['name', 'phone', 'username'];
		try {
			const id: string = req.user._id;
			const data: any = await model.findById(id);

			if (!data) return res.status(404).json({ message: 'User Not Found' });

			const updates = Object.keys(req.body);
			const isValidOperation = updates.every(update => allowEdits.includes(update));

			if (!isValidOperation) {
				const invalidUpdates = updates.filter(update => !allowEdits.includes(update));
				return res.status(400).json({
					message: `Invalid fields: '${invalidUpdates.join(', ')}' not allowed`,
				});
			}

			updates.forEach((update: any) => (data[update] = req.body[update]));

			const saved = await data.save();

			return res.status(200).json({ message: 'Information Updated Successfully' });
		} catch (e: any) {
			const message = e?.message || 'Something went wrong';
			console.log(message);
			return res.status(500).json({ message });
		}
	};

export default updateSelfController;
