import Joi from 'joi';

const validatorhelplerText = {
	email: Joi.string().max(255).required().email().messages({
		'any.required': 'Email is required',
		'string.email': 'Invalid Email, please enter a valid email address',
	}),
	password: Joi.string().min(8).max(255).required().messages({
		'string.min': 'Password must be 8 characters long',
		'any.required': 'Password is required',
	}),
};

export default validatorhelplerText;
