import { Response } from 'express';
import {
	convertType,
	convertToTableFields,
	convertToViewFields,
	convertToFormFields,
} from '../../functions/_index.js';

import { Config } from '../../models/_index.js';
import { rulesOf, withRenderIf } from '../../functions/formRules.function.js';

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
			let keys: string[] = [];
			const settings = schema?.settings || {};
			const schm = Object.keys(settings).reduce(
				(acc, key) => {
					keys.push(key);
					const constructSchema = {
						label: settings[key]?.schema?.label ? settings[key].schema.label : settings[key].title,
						// The name is what a row *is* — every other column describes it.
						// Defaulted here rather than repeated across ~80 settings files,
						// and a model that disagrees can set `bold: false` in its schema
						// (the spread below wins over this).
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

			const getRoute = route || req?.destPath;
			const configuration: any = await Config.findOne({ path: getRoute }).lean();

			if (configuration && !configuration.isDisabled) {
				const table = convertToTableFields({
					schema: schm,
					fields: configuration?.tableFields,
				});

				const view = convertToViewFields({
					schema: schm,
					fields: configuration?.viewFields,
				});

				const form = convertToFormFields({
					schema: schm,
					layout: configuration?.formFields,
				});

				return res.status(200).json({ table, view, form, schema: schm });
			} else if (!config) {
				return res.status(400).json({ message: 'Configuration not provided' });
			} else {
				const filteredConfig = {
					...config,
					schema: schm,
					fields: (config.fields || []).filter(field => keys.includes(field)),
					table: (config.table || []).filter(field => keys.includes(field)),
					// A published config may hold only some sections (a view, say), so
					// each list defaults to empty rather than assuming the file's shape.
					form: (config.form || []).map(section => ({
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

				// `config` is already the resolved one — the published RouteConfig
				// when there is one — so its `table` is the builder's column order.
				const tableFields = convertToTableFields({
					schema: schm,
					fields: filteredConfig?.table,
				});

				const viewFields = convertToViewFields({
					schema: schm,
					fields: filteredConfig?.fields,
				});

				// Conditional fields: the config's formRules over the settings' renderIf.
				const formFields = convertToFormFields({
					schema: withRenderIf(schm, rulesOf(settings, config)),
					layout: filteredConfig?.form,
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
