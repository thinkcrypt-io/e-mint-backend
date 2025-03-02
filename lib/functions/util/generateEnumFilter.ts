import { generateLabel } from './index.js';

const enumFilter = ({ values, key }: any): any => {
	const enumValues = values;

	if (!enumValues || enumValues == 0) return {};
	const title = key.charAt(0).toUpperCase() + key.slice(1);

	return {
		filter: {
			name: key,
			field: `${key}_in`,
			type: 'multi-select',
			label: title,
			title: `Filter by ${title}`,
			options: enumValues.map((value: string) => ({ label: generateLabel(value), value })),
		},
	};
};

export default enumFilter;
