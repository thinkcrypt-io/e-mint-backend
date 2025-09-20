const generateErrorMessages = (field: string) => ({
	'string.min': `${field} should have a minimum length of {#limit}`,
	'string.max': `${field} should have a maximum length of {#limit}`,
	'string.empty': `${field} cannot be an empty field`,
	'any.required': `${field} is a required field`,
	'number.base': `${field} should be a number`,
	'number.empty': `${field} cannot be an empty field`,
	'number.min': `${field} should have a minimum value of {#limit}`,
	'number.max': `${field} should have a maximum value of {#limit}`,
	'array.base': `${field} should be an array`,
	'array.empty': `${field} cannot be an empty array`,
	'boolean.base': `${field} should be a boolean`,
});

export default generateErrorMessages;
