import { Filter } from '../../../imports.js';

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

const filters = {
	createdAt: createdAtFilter,
	tags: tagsFilter,
};

export default filters;
