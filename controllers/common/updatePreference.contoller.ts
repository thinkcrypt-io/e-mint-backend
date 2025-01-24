import { Response } from 'express';
import mongoose from 'mongoose';

const updatePreferenceController = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const id: string = req.user._id;
			const data = (await model.findById(id).select('-password')) as any;

			if (!data) {
				return res.status(404).json({ message: 'User Not Found' });
			}

			const { field, preferences }: any = req.body;

			data.preferences[field] = preferences;

			const saved = await data.save();

			return res.status(200).json(saved);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default updatePreferenceController;
