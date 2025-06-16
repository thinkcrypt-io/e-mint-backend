type TableDataFieldConverter = {
	schema: any;
	menu?: boolean;
	fields?: string[];
};

const createTableField = ({ key, field }: { key: string; field: any }): any => {
	return {
		title: field?.tableLabel || field?.label || field?.title,
		dataKey: field?.tableKey || key,
		default: field?.default || false,
		...(field?.sort && { sort: key }),
		...(field?.type && {
			type: field?.tableType || field.type,
		}),
		...(field?.imageKey && { imageKey: field.imageKey }),
		...(field?.colorScheme && { colorScheme: field.colorScheme }),
		...(field?.helperText && { helperText: field.helperText }),
		...(field?.editable && { editable: field.editable }),
		...(field?.copy && { copy: field.copy }),
		...(field?.tooltip && { tooltip: field.tooltip }),
	};
};

const convertToTableFields = ({ schema, menu = true, fields }: TableDataFieldConverter): any[] => {
	const tableFields: any[] = [];

	const processField = (key: string) => {
		const field = schema[key];

		if (!field?.displayInTable) return;

		const tableField = createTableField({ key, field });
		tableFields.push(tableField);
	};

	if (fields && fields.length > 0) {
		fields.forEach(processField);
	} else {
		Object.keys(schema).forEach(processField);
	}

	if (menu) tableFields.push({ title: '...', type: 'menu' });

	return tableFields;
};

export default convertToTableFields;
