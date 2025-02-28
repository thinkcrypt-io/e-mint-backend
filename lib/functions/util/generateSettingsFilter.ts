import { generateLabel } from './index.js';

const generateSettingsFilter = ({ key, type, values }: any): any => {
	const title = key.charAt(0).toUpperCase() + key.slice(1);

	if (!values || values == 0) {
		if (type == 'Boolean')
			return {
				filter: {
					name: key,
					type: 'boolean',
					label: generateLabel(key),
					title: `Filter by ${generateLabel(key)}`,
				},
			};
		else if (type == 'Date')
			return {
				filter: {
					name: key,
					type: 'date',
					label: generateLabel(key),
					title: `Filter by ${generateLabel(key)}`,
				},
			};
		else if (type == 'ObjectId')
			return {
				filter: {
					name: key,
					field: `${key}_in`,
					type: 'multi-select',
					category: 'model',
					model: key,
					key: 'name',
					label: generateLabel(key),
					title: `Filter by ${generateLabel(key)}`,
				},
			};
		else return {};
	} else {
		return {
			filter: {
				name: key,
				field: `${key}_in`,
				type: 'multi-select',
				label: title,
				title: `Filter by ${title}`,
				options: values.map((value: string) => ({ label: generateLabel(value), value })),
			},
		};
	}
};

export default generateSettingsFilter;
