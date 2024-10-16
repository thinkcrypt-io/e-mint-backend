import { Response } from 'express';
import Model from '../../../models/admin/admin.model.js';
import { getErrorMessage } from '../../../imports.js';

const updateAdminPreferences = async (req: any, res: Response): Promise<Response> => {
	try {
		const id: string = req.user._id;
		const data = (await Model.findById(id).select('-password')) as any;

		if (!data) {
			return res.status(404).json({ message: 'User Not Found' });
		}

		const { field, preferences }: any = req.body;

		data.preferences[field] = preferences;

		const saved = await data.save();

		return res.status(200).json(saved);
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).json({ message });
	}
};

export default updateAdminPreferences;
