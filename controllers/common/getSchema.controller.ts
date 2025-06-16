import { Response } from 'express';
import convertType from './convertType.js';

const getSchema = ({ settings }: { settings: any }) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			let keys: string[] = [];
			const schema = Object.keys(settings).reduce(
				(acc, key) => {
					keys.push(key);
					const constructSchema = {
						label: settings[key]?.schema?.label ? settings[key].schema.label : settings[key].title,
						type: settings[key]?.schema?.type
							? settings[key].schema.type
							: convertType(settings[key].type),
						isRequired: settings[key]?.required,
						displayInTable: true,
						renderCondition: settings[key]?.schema?.renderCondition
							? settings[key].schema.renderCondition.toString()
							: undefined,
						...settings[key]?.schema,
					};

					acc[key] = constructSchema;

					return acc;
				},
				{} as Record<string, any>
			);

			const { type } = req.query;

			if (type === 'keys') {
				return res.status(200).json({ keys });
			}

			return res.status(200).json(schema);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getSchema;
