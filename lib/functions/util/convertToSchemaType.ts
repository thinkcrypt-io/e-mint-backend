import { generateLabel } from './index.js';

type ConvertToSchemaType = {
	type: string;
	values?: string[];
	key: string;
};

const convertToSchemaType = ({ type, values, key }: ConvertToSchemaType): any => {
	if (!values || values?.length == 0) {
		switch (type) {
			case 'ObjectId':
				return {
					type: 'data-menu',
					tableType: 'string',
					tableKey: `${key}.name`,
					model: `${key}s`,
				};
			case 'Date':
				return { type: 'date', tableType: 'string' };
			default:
				return {};
		}
	} else
		return {
			type: 'select',
			options: values.map(value => ({ label: generateLabel(value), value })),
		};
};

export default convertToSchemaType;
