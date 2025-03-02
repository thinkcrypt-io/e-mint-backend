const generateLabel = (val: string): string => {
	return (
		val
			// Handle camelCase
			.replace(/([A-Z])/g, ' $1') // Insert space before capital letters
			// Handle kebab-case
			.split('-')
			.map(word => word.trim()) // Trim any extra spaces
			.filter(word => word.length > 0) // Remove empty strings
			.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(' ')
	);
};

export default generateLabel;
