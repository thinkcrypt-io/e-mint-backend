import { User } from '../../imports.js';
import { Response } from 'express';

const updateSellerSelfController = async (req: any, res: Response): Promise<Response> => {
	const allowEdits = ['name', 'phone'];
	try {
		const id: string = req.user._id;
		const data = await User.findById(id);

		if (!data) {
			return res.status(404).json({ message: 'User Not Found' });
		}

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

		return res.status(200).json({ message: 'Information Updated Successfylly', doc: saved });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default updateSellerSelfController;
