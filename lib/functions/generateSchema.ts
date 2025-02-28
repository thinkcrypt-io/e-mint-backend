// Purpose: Generate schema for the table based on the model.
import { generateLabel, convertToSchemaType, generateSettingsFilter } from './util/index.js';

type GenerateSchema = {
	keys: string[];
	model: any;
};

const getType = (instance: string) => {
	if (instance === 'ObjectId') return 'string';
	return instance?.toLowerCase();
};

const isSortable = ({ instance, values }: any) => {
	if (values) {
		if (values.length > 0) return true;
	}
	if (instance === 'Boolean') return true;
	if (instance === 'Date') return true;
	if (instance === 'Number') return false;
	if (instance === 'String') return false;
	if (instance === 'ObjectId') return true;
	return false;
};

const generateSchema = ({ keys, model }: GenerateSchema) => {
	const settings = keys.reduce((acc: Record<string, any>, key: string) => {
		if (key === '_id') return acc;
		if (key == 'updatedAt') return acc;
		acc[key] = {
			title: generateLabel(key),
			type: getType(model.schema.paths[key].instance),
			sort: isSortable({
				instance: model.schema.paths[key].instance,
				values: model.schema.paths[key].enumValues,
			}),
			search: model.schema.paths[key].instance == 'String',
			// unique: false,
			// exclude: false,
			edit: true,
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

			...generateSettingsFilter({
				type: model.schema.paths[key].instance,
				values: model.schema.paths[key].enumValues,
				key,
			}),

			schema: {
				...convertToSchemaType({
					key,
					type: model.schema.paths[key].instance,
					values: model.schema.paths[key].enumValues,
				}),
			},
		};
		return acc;
	}, {});
	return settings;
};

export default generateSchema;
