import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { setttingsTypeOptions } from '../../lib/types/settings.types.js';

const getModelKeys = (req: Request, res: Response) => {
	const { id } = req.params;
	try {
		if (!id) {
			return res.status(400).json({ message: 'Please provide a Model Name.' });
		}

		let model;

		model = mongoose.model(id);

		if (!model) return res.status(404).json({ message: `Model '${id}' not found.` });
		// Retrieve all keys (schema paths) from the model's schema.
		const keys = Object.keys(model.schema.paths);

		// Optionally, filter out internal keys such as __v.
		const filteredKeys: string[] = keys.filter(key => key !== '__v');

		const types = setttingsTypeOptions;

		const settings = filteredKeys.map((key: string) => {
			return {
				// [key]: model.schema.paths[key].options,
				[key]: {
					title: key?.charAt(0).toUpperCase() + key?.slice(1),
					type: model.schema.paths[key].instance,
					sort: false,
					search: false,
					unique: false,
					exclude: false,
					required: model.schema.paths[key].isRequired,
					trim: model.schema.paths[key].options.trim,
					populate: {},
					min: model.schema.paths[key].options.min,
					max: model.schema.paths[key].options.max,
					filter: {
						name: key,
						field: key,
						type: 'text',
						label: key,
						title: `Sort by ${key}`,
					},
				},
			};
		});

		return res.json({ keys: filteredKeys, settings, types });
	} catch (error: any) {
		return res.status(500).json({ message: error.message });
	}
};

export default getModelKeys;
