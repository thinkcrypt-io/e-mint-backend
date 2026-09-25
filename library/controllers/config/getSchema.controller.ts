import { Response } from 'express';
import { convertType } from '../../functions/_index.js';
import { rulesOf, withRenderIf } from '../../functions/formRules.function.js';

/** `formRules`: the route config's conditional fields, set as each field's `renderIf` for hand-written form layouts. */
const getSchema = ({ settings, formRules }: { settings: any; formRules?: any }) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			let keys: string[] = [];
			const schema = Object.keys(settings).reduce(
				(acc, key) => {
					keys.push(key);
					const constructSchema = {
						label: settings[key]?.schema?.label ? settings[key].schema.label : settings[key].title,
						// The name is what a row *is* — every other column describes it,
						// so it carries the row's weight. Defaulted here rather than
						// repeated across ~80 settings files; a model that disagrees sets
						// `bold: false` in its schema (the spread below wins over this).
						bold: key === 'name',
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

			return res.status(200).json(withRenderIf(schema, rulesOf(settings, { formRules })));
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getSchema;
