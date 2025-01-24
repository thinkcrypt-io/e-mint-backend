import { Staff as Admin } from '../../imports.js';
import { Response, Request } from 'express';

const staffGetSelfController = async (req: any, res: Response): Promise<Response> => {
	try {
		const data = await Admin.findById(req.user._id)
			.select('-password')
			.populate('location')
			.populate('shop');

		if (!data) {
			return res.status(404).json({ message: 'User Not Found' });
		}

		return res.status(200).json(data);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default staffGetSelfController;
