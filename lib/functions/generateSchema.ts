// Purpose: Generate schema for the table based on the model.

type GenerateSchema = {
	keys: string[];
	model: any;
};

const generateSchema = ({ keys, model }: GenerateSchema) => {
	const settings = keys.reduce((acc: Record<string, any>, key: string) => {
		acc[key] = {
			title: key.charAt(0).toUpperCase() + key.slice(1),
			type: model.schema.paths[key].instance?.toLowerCase(),
			sort: false,
			search: false,
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
			schema: {
				displayInTable: true,
			},
			// filter: {
			// 	name: key,
			// 	field: key,
			// 	type: 'text',
			// 	label: key,
			// 	title: `Sort by ${key}`,
			// },
		};
		return acc;
	}, {});
	return settings;
};

export default generateSchema;
