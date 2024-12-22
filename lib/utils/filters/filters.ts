import mongoose from 'mongoose';

type Options = { label: string; value: string };

type Filter = {
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

const createdAtFilter: Filter = {
	name: 'createdAt',
	field: 'createdAt',
	type: 'date',
	label: 'Created At',
	title: 'Sort by created at',
};

const tagsFilter: Filter = {
	name: 'tags',
	field: 'tags_in',
	type: 'multi-select',
	label: 'Tag',
	title: 'Sort by Tag',
	category: 'distinct',
	key: 'tags',
};

const isActive: Filter = {
	name: 'isActive',
	field: 'isActive',
	type: 'boolean',
	label: 'Is Active',
	title: 'Sort by Active',
};

const isDeleted: Filter = {
	name: 'isDeleted',
	field: 'isDeleted',
	type: 'boolean',
	label: 'Is Deleted',
	title: 'Sort by Deleted',
};

const filters = {
	createdAt: createdAtFilter,
	tags: tagsFilter,
	isActive: isActive,
	isDeleted: isDeleted,
};

export default filters;
