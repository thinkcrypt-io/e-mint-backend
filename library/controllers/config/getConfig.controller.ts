import { Response } from 'express';
import {
	convertType,
	convertToTableFields,
	convertToViewFields,
	convertToFormFields,
} from '../../functions/_index.js';

import { Config, FieldConfig, TableConfig } from '../../models/_index.js';

type ConfigType = {
	table: string[];
	fields: string[];
	form: { sectionTitle: string; fields: (string | string[])[] }[];
};

const getConfig = ({
	config,
	schema,
	route,
}: {
	config?: ConfigType;
	schema: any;
	route?: string;
}) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			if (!config) {
				return res.status(400).json({ message: 'Configuration not provided' });
			} else {
				let keys: string[] = [];
				const settings = schema?.settings || {};
				const schm = Object.keys(settings).reduce(
					(acc, key) => {
						keys.push(key);
						const constructSchema = {
							label: settings[key]?.schema?.label
								? settings[key].schema.label
								: settings[key].title,
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

				const filteredConfig = {
					...config,
					schema: schm,
					fields: config.fields.filter(field => keys.includes(field)),
					table: config.table.filter(field => keys.includes(field)),
					form: config.form.map(section => ({
						...section,
						fields: section.fields
							.map(f => {
								if (Array.isArray(f)) {
									const filteredArray = f.filter((ff: string) => keys.includes(ff));
									return filteredArray.length > 0 ? filteredArray : null;
								} else {
									return keys.includes(f) ? f : null;
								}
							})
							.filter(Boolean),
					})),
				};

				let tableFields = [];

				const configuration: any = await Config.findOne({ path: route }).lean();

				tableFields = convertToTableFields({
					schema: schm,
					fields:
						route && configuration?.tableFields ? configuration.tableFields : filteredConfig?.table,
				});

				const viewFields = convertToViewFields({
					schema: schm,
					fields:
						route && configuration?.viewFields ? configuration.viewFields : filteredConfig?.fields,
				});

				const formFields = convertToFormFields({
					schema: schm,
					layout:
						route && configuration?.formFields ? configuration.formFields : filteredConfig?.fields,
				});

				return res
					.status(200)
					.json({ table: tableFields, view: viewFields, form: formFields, schema: schm });
			}
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getConfig;
