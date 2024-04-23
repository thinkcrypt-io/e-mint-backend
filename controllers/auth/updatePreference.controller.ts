import { Response } from 'express';
import User from '../../models/user/user.model.js';

const updateSellerPreferences = async (req: any, res: Response): Promise<Response> => {
	try {
		const id: string = req.user._id;
		const data = (await User.findById(id).select('-password')) as any;

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

export default updateSellerPreferences;
