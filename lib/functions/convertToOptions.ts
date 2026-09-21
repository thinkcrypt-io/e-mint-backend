const convertToOptions = (options: string[]): { label: string; value: string }[] => {
	// `?.map` on a nullish input yields undefined, which contradicts the declared
	// return type and puts the burden on every caller. An empty list is what the
	// signature already promises.
	if (!options) return [];

	return options.map(term => {
		const label = term
			.split('-')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');

		return {
			label,
			value: term,
		};
	});
};

export default convertToOptions;
