const fields = [
	'name',
	'description',
	'key',
	'isActive',
	'options.create',
	'options.view',
	'options.edit',
	'options.delete',
	'createdAt',
];

const tableFields = [
	'name',
	'key',
	'isActive',
	'options.create',
	'options.view',
	'options.edit',
	'options.delete',
	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'Permission Details',
		fields: [
			'name',
			['key', 'isActive'],
			['options.create', 'options.view'],
			['options.edit', 'options.delete'],
		],
	},
	{
		sectionTitle: 'Description',
		fields: ['description'],
	},
];

const config = {
	fields,
	table: tableFields,
	form: formFields,
};

export default config;
