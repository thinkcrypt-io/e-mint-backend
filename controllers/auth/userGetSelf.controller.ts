import Customer from '../../models/customer/customer.model.js';
import { Response } from 'express';

const userGetSelf = async (req: any, res: Response): Promise<Response> => {
	try {
		const id: string = req.user._id;
		const data = await Customer.findById(id).select('-password');

		if (!data) {
			return res.status(404).json({ message: 'User Not Found' });
		}

		return res.status(200).json(data);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default userGetSelf;
