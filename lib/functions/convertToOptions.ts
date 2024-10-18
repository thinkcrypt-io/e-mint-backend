const convertToOptions = (options: string[]): { label: string; value: string }[] => {
	return options?.map(term => {
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
