import { Response } from 'express';
import Model from '../../../library/models/admin/model.js';
import { getErrorMessage } from '../../../imports.js';
import { dynamicMounts } from '../../../library/functions/routeRegistry.function.js';

const updateAdminPreferences = async (req: any, res: Response): Promise<Response> => {
	try {
		const id: string = req.user._id;
		const data = (await Model.findById(id).select('-password')) as any;

		if (!data) {
			return res.status(404).json({ message: 'User Not Found' });
		}

		const { field, preferences }: any = req.body;

		// Routes built in the model builder aren't in the schema's preferences
		// map (it lists every code route by hand), so a plain assignment would
		// be dropped on save. They're written straight to the document instead.
		if (typeof field === 'string' && dynamicMounts.has(field) && !Model.schema.path(`preferences.${field}`)) {
			if (!Array.isArray(preferences) || preferences.some((p: any) => typeof p !== 'string'))
				return res.status(400).json({ message: 'Preferences must be a list of column keys' });
			await Model.updateOne({ _id: id }, { $set: { [`preferences.${field}`]: preferences } }, { strict: false });
			return res.status(200).json(await Model.findById(id).select('-password'));
		}

		data.preferences[field] = preferences;

		const saved = await data.save();

		return res.status(200).json(saved);
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).json({ message });
	}
};

export default updateAdminPreferences;
