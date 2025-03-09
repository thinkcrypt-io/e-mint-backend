const booleanFilter = ({ key, type }: any): any => {
	if (type !== 'boolean') return {};
	const title = key.charAt(0).toUpperCase() + key.slice(1);

	return {
		filter: {
			name: key,
			type: 'boolean',
			label: title,
			title: `Filter by ${title}`,
		},
	};
};

export default booleanFilter;
