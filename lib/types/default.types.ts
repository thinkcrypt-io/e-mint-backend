import mongoose from 'mongoose';
import { Filter } from './filter.types.js';
import Joi from 'joi';

export type IfExistType = { model: mongoose.Model<any>; fields: string };
export type IsDeletePossibleType = { model: mongoose.Model<any>; field?: string; error?: string };

export type QuerySettings = {
	sortables: string[];
	searchables: string[];
	populate: any;
	filters: Filter[];
};

export type Settings = {
	validator: {
		insert: Joi.Schema<any>;
		update: Joi.Schema<any>;
	};
	sortables: string[];
	searchables: string[];
	duplicates: string;
	populate: any;
	editables: string[];
	filters: Filter[];
};

export type Validator = {
	min?: number;
	max?: number;
	type?: string;
	title?: string;
	required?: boolean;
	insertOnly?: boolean;
};

export type ConfigItem = {
	validator?: Validator;
	sort?: boolean;
	search?: boolean;
	edit?: boolean;
	populate?: boolean;
	filter?: any;
	unique?: boolean;
	min?: number;
	max?: number;
	type?: string;
	title?: string;
	required?: boolean;
	insertOnly?: boolean;
	trim?: boolean;
	allowNull?: boolean;
};

export type Config = {
	MODEL: mongoose.Model<any>;
	POST_VALIDATOR?: Joi.Schema<any>;
	UPDATE_VALIDATOR?: Joi.Schema<any>;
	FILTER_OPTIONS?: {
		allowSort?: string[];
		allowSearch?: string[];
	};
	VALIDATORS?: {
		POST: Joi.Schema<any>;
		UPDATE: Joi.Schema<any>;
	};
	EXIST_OPTIONS?: any;
	EDITS?: {
		model: mongoose.Model<any>;
		allowEdits: string[];
	};

	QUERY?: {
		allowSort?: string[];
		allowSearch?: string[];
	};
	FILTERS?: { filters: Filter[]; role?: string };
	FILTER_LIST?: any;
	QUERY_OPTIONS?: {
		model: mongoose.Model<any>;
		populate: any;
	};
};
