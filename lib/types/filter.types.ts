import mongoose from 'mongoose';

type Option = {
	value: string;
	label: string;
};

type FilterBase = {
	_id?: string;
	name: string;
	field?: string;
	label?: string;
	title?: string;
	roles?: string[];
};

type FilterWithSelect = FilterBase & {
	type: 'multi-select' | 'select';
	options?: Option[];
};

type FilterWithoutSelect = FilterBase & {
	type: 'boolean' | 'range' | 'date';
	options?: never;
};

type FilterWithModel = (FilterWithSelect | FilterWithoutSelect) & {
	category: 'model' | 'distinct';
	key: string;
	model: mongoose.Model<any>;
};

type FilterWithoutModel = (FilterWithSelect | FilterWithoutSelect) & {
	category?: 'default';
	key?: never;
	model?: never;
};

export type Filter = FilterWithModel | FilterWithoutModel;
export type FilterResponse = FilterBase & { options?: Option[] };
