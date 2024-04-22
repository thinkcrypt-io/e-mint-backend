import Joi from 'joi';
import mongoose from 'mongoose';
import { Filter } from '../types/filter.types.js';
import buildValidator from './buildValidator.js';
import { ConfigItem } from '../types/default.types.js';

type Config = {
	MODEL: mongoose.Model<any>;
	VALIDATORS: {
		POST: Joi.Schema<any>;
		UPDATE: Joi.Schema<any>;
		INSERT?: Joi.Schema<any>;
	};
	FILTER_OPTIONS: {
		allowSort: string[];
		allowSearch: string[];
	};
	EXIST_OPTIONS: {
		model: mongoose.Model<any>;
		fields: string;
	};
	QUERY_OPTIONS: {
		model: mongoose.Model<any>;
		populate: any;
	};
	EDITS: {
		model: mongoose.Model<any>;
		allowEdits: string[];
	};
	FILTER_LIST: {
		filters: Filter[];
		role?: string;
		baseModel: mongoose.Model<any>;
	};
};

type ConstructConfigParams = {
	model: any;
	config: Record<string, ConfigItem>;
	options?: { role?: string };
};

const constructConfig = ({ model, config, options }: ConstructConfigParams): Config => {
	const { role = 'user' } = options || {};

	const configKeys = Object.keys(config);
	const { insert, update } = buildValidator(config);

	return {
		MODEL: model,
		VALIDATORS: {
			POST: Joi.object(insert),
			UPDATE: Joi.object(update),
		},
		FILTER_OPTIONS: {
			allowSort: configKeys.filter(key => config[key].sort) || [],
			allowSearch: configKeys.filter(key => config[key].search) || [],
		},
		EXIST_OPTIONS: {
			model: model,
			fields: configKeys.filter(key => config[key].unique).join(' ') || '',
		},
		QUERY_OPTIONS: {
			model: model,
			populate:
				configKeys.filter(key => config[key].populate).map(key => config[key].populate) || '',
		},
		EDITS: {
			model: model,
			allowEdits: configKeys.filter(key => config[key].edit) || [],
		},
		FILTER_LIST: {
			filters: configKeys.filter(key => config[key].filter).map(key => config[key].filter) || [],
			role: role,
			baseModel: model,
		},
	};
};

export default constructConfig;
