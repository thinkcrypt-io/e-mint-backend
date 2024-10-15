import User from '../../models/user/user.model.js';
import { Response } from 'express';

const getSelf = async (req: any, res: Response): Promise<Response> => {
	try {
		const id: string = req.user._id;
		const data = await User.findById(id).select('-password').populate('role shop');

		if (!data) {
			return res.status(404).json({ message: 'User Not Found' });
		}

		return res.status(200).json(data);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default getSelf;
