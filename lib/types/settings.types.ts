import mongoose from 'mongoose';

type Options = { label: string; value: string };

type Filter = {
	name: string;
	type: 'multi-select' | 'range' | 'boolean' | 'date';
	label: string;
	title: string;
	options?: Options[];
	category?: string;
	model?: mongoose.Model<any>;
	key?: string;
	roles?: [string];
	field?: string;
};

type SettingType = {
	sort?: boolean;
	search?: boolean;
	title: string;
	unique?: boolean;
	type:
		| 'string'
		| 'email'
		| 'uri'
		| 'array-string'
		| 'boolean'
		| 'number'
		| 'text'
		| 'object'
		| 'array-number'
		| 'array';
	required?: boolean;
	filter?: Filter;
	edit?: boolean;
	trim?: boolean;
	populate?: { path: string; select: string };
	min?: number;
	max?: number;
};

export default SettingType;
