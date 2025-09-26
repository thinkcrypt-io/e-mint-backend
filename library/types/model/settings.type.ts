import mongoose from 'mongoose';

type Options = { label: string; value: string };

export type Filter = {
	name: string;
	type: 'multi-select' | 'range' | 'boolean' | 'date' | 'text' | 'select';
	label: string;
	title: string;
	options?: Options[];
	category?: 'model' | 'distinct';
	model?: mongoose.Model<any>;
	key?: string;
	roles?: [string];
	field?: string;
};

export type Schema = any;

// 'string' | 'text' | 'email' | 'uri' | 'date' | 'array-string' | 'boolean' | 'number' | 'object' | 'array' | 'array-number' | 'array-object';

export const setttingsTypeOptions = [
	'string',
	'email',
	'uri',
	'date',
	'array-string',
	'boolean',
	'number',
	'text',
	'object',
	'array-number',
	'array',
	'array-object',
];

type SettingType = {
	title: string;
	type: (typeof setttingsTypeOptions)[number];
	sort?: boolean;
	search?: boolean;
	unique?: boolean;
	exclude?: boolean;
	required?: boolean;
	filter?: Filter;
	schema?: Schema;
	edit?: boolean;
	trim?: boolean;
	populate?: { path: string; select?: string; populate?: any };
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
