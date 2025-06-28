const fields = [
	'name',
	'description',
	'href',
	'icon',
	'iconDark',
	'category',
	'tooltip',
	'priority',
	'isActive',
	'permissionProtected',
	'permission',
];

const tableFields = [
	'name',
	'href',
	'category',
	'priority',
	'isActive',
	'permissionProtected',
	'permission',
];

const formFields = [
	{
		sectionTitle: 'Sidebr Item',
		fields: [
			'name',
			['href', 'category'],
			['permissionProtected', 'permission'],
			['isActive', 'priority'],
		],
	},
	{
		sectionTitle: 'Icons',
		fields: ['icon', 'iconDark'],
	},
	{
		sectionTitle: 'Description',
		fields: ['tooltip', 'description'],
	},
];

const config = {
	fields,
	table: tableFields,
	form: formFields,
};

export default config;
