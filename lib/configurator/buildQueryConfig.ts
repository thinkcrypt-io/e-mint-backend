import mongoose from 'mongoose';
import { Filter } from '../types/filter.types.js';
import { QuerySettings } from '../types/default.types.js';

type Config = {
	MODEL: mongoose.Model<any>;
	FILTER_OPTIONS: {
		allowSort: string[];
		allowSearch: string[];
	};
	QUERY_OPTIONS: {
		model: mongoose.Model<any>;
		populate: any;
	};
	FILTER_LIST: {
		filters: Filter[];
		role: string;
	};
};

type BuildConfig = {
	model: mongoose.Model<any>;
	settings: QuerySettings;
	filters: Filter[];
	options?: any;
};

const buildQueryConfig = ({ model, settings, filters, options }: BuildConfig): Config => {
	const { role = 'user' } = options || {};

	const { sortables: allowSort = [], searchables: allowSearch = [], populate = '' } = settings;

	return {
		MODEL: model,
		FILTER_OPTIONS: {
			allowSort: allowSort,
			allowSearch: allowSearch,
		},

		QUERY_OPTIONS: {
			model: model,
			populate: populate,
		},

		FILTER_LIST: {
			filters: filters,
			role: role,
		},
	};
};

export default buildQueryConfig;
