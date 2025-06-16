const typeMap: Record<string, string> = {
	email: 'string',
	'array-string': 'tag',
	boolean: 'checkbox',
};

const convertType = (type: string): string => {
	return typeMap[type] || type;
};

export default convertType;
