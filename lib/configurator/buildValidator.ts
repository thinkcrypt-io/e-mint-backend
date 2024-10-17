import Joi, { Schema } from 'joi';
import error from '../validator/generateErrorMessage.validator.js';
import { ConfigItem } from '../types/default.types.js';

const buildValidator = (config: Record<string, ConfigItem>): { insert: any; update: any } => {
	const insert: Record<string, Schema> = {};
	const update: Record<string, Schema> = {};

	Object.entries(config).forEach(([key, item]) => {
		const { min, max, type = 'string', title, required, edit, trim, allowNull } = item;
		let base: any;

		switch (type) {
			case 'string':
				base = Joi.string();
				break;
			case 'number':
				base = Joi.number();
				break;
			case 'boolean':
				base = Joi.boolean();
				break;
			case 'uri':
				base = Joi.string().uri();
				break;
			case 'array-string':
				base = Joi.array().items(Joi.string());
				break;
			case 'array-number':
				base = Joi.array().items(Joi.number());
				break;
			case 'array-object':
				base = Joi.array().items(Joi.object());
				break;
			case 'array':
				base = Joi.array();
				break;
			case 'email':
				base = Joi.string().email();
				break;
			case 'object':
				base = Joi.object();
				break;
			default:
				base = Joi.string();
				break;
		}

		if (min) base = base.min(min);
		if (max) base = base.max(max);
		if (trim) base = base.trim();
		if (!required) base = base.allow('');

		insert[key] = base.messages(error(title || ''));
		if (required) insert[key] = insert[key].required();
		update[key] = base.messages(error(title || ''));
		if (!edit) delete update[key];
	});

	return { insert, update };
};

export default buildValidator;
