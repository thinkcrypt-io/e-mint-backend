import mongoose from 'mongoose';

type Options = { label: string; value: string };

export type Filter = {
	name: string;
	type: 'multi-select' | 'range' | 'boolean' | 'date' | 'text';
	label: string;
	title: string;
	options?: Options[];
	category?: 'model' | 'distinct';
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
	exclude?: boolean;
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
		| 'array'
		| 'array-object';
	required?: boolean;
	filter?: Filter;
	edit?: boolean;
	trim?: boolean;
	populate?: { path: string; select: string; populate?: any };
	min?: number;
	max?: number;
};

export type Settings = {
	[key: string]: SettingType;
};

export type SettingsType<T> = {
	[K in keyof T]: SettingType;
};

export default SettingType;
