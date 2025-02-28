import { generateLabel } from './index.js';

const generateModelFilter = ({ key, type }: any): any => {
	if (type !== 'ObjectId') return {};

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
};

export default generateModelFilter;
