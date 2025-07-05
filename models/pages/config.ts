const fields = [
	'name',
	'subTitle',
	'path',
	'export',
	'showAddButton',
	'button.title',
	'button.isModal',
	'createdAt',
	'updatedAt',
];

const tableFields = [
	'name',
	'subTitle',
	'path',
	'export',
	'showAddButton',
	'button.title',
	'button.isModal',
	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'Page Information',
		fields: ['name', 'subTitle', 'path'],
	},
	{
		sectionTitle: 'Header Buttons',
		fields: [
			['showAddButton', 'export'],
			['button.title', 'button.isModal'],
		],
	},
];

const config = {
	fields,
	table: tableFields,
	form: formFields,
};

export default config;
