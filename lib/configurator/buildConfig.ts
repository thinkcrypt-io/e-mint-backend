import Joi from 'joi';
import mongoose from 'mongoose';
import { Filter } from '../types/filter.types.js';
import { Settings } from '../types/default.types.js';

type Config = {
	MODEL: mongoose.Model<any>;
	VALIDATORS: {
		INSERT: Joi.Schema<any>;
		UPDATE: Joi.Schema<any>;
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
		role: string;
	};
};

type BuildConfig = {
	model: mongoose.Model<any>;
	settings: Settings;
	filters: Filter[];
	options?: any;
};

const buildConfig = ({ model, settings, filters, options }: BuildConfig): Config => {
	const { role = 'user' } = options || {};

	const {
		sortables: allowSort = [],
		searchables: allowSearch = [],
		duplicates = '',
		populate = '',
		editables: allowEdits = [],
		validator: { insert, update },
	} = settings;

	return {
		MODEL: model,
		VALIDATORS: {
			INSERT: insert,
			UPDATE: update,
		},
		FILTER_OPTIONS: {
			allowSort: allowSort,
			allowSearch: allowSearch,
		},
		EXIST_OPTIONS: {
			model: model,
			fields: duplicates,
		},
		QUERY_OPTIONS: {
			model: model,
			populate: populate,
		},
		EDITS: {
			model: model,
			allowEdits: allowEdits,
		},
		FILTER_LIST: {
			filters: filters,
			role: role,
		},
	};
};

export default buildConfig;
