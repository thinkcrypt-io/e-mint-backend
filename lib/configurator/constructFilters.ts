import mongoose from 'mongoose';
import { Filter } from '../types/filter.types.js';

type Config = {
	MODEL: any;
	FILTER_LIST: {
		filters: Filter[];
		role?: string;
		baseModel: mongoose.Model<any>;
	};
};

const constructFilters = ({ model, config, options }: any): Config => {
	const { role = 'user' } = options || {};

	const configKeys = Object.keys(config);

	return {
		MODEL: model,

		FILTER_LIST: {
			filters: configKeys.filter(key => config[key].filter).map(key => config[key].filter) || [],
			role: role,
			baseModel: model,
		},
	};
};

export default constructFilters;
