import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { setttingsTypeOptions } from '../../lib/types/settings.types.js';

const getModelKeys = (req: Request, res: Response) => {
	const { id } = req.params;
	const { type } = req.params;
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

		if (type == 'keys') {
			return res.json(filteredKeys);
		} else if (type == 'settings') {
			const settings = filteredKeys.reduce((acc: Record<string, any>, key: string) => {
				acc[key] = {
					title: key.charAt(0).toUpperCase() + key.slice(1),
					type: model.schema.paths[key].instance?.toLowerCase(),
					sort: false,
					search: false,
					unique: false,
					exclude: false,
					required: model.schema.paths[key].isRequired,
					trim: model.schema.paths[key].options.trim,
					...(model.schema.paths[key].instance == 'ObjectId' && {
						populate: {
							path: key,
							select: 'name',
						},
					}),
					min: model.schema.paths[key].options.min,
					max: model.schema.paths[key].options.max,
					schema: {
						displayIntable: true,
					},
					filter: {
						name: key,
						field: key,
						type: 'text',
						label: key,
						title: `Sort by ${key}`,
					},
				};
				return acc;
			}, {});

			return res.status(200).json(settings);
		} else if (type == 'types') {
			const types = setttingsTypeOptions;
			return res.json(types);
		}
	} catch (error: any) {
		return res.status(500).json({ message: error.message });
	}
};

export default getModelKeys;
