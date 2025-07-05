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

const route = {
	title: 'Page Route Management',
	subTitle: 'Manage your page routes and their configurations',
	path: 'pages',

	menu: [
		{ type: 'view-server-modal', title: 'View' },
		{ type: 'view-item', title: 'Go To Post' },
		{
			title: 'Update Information',
			type: 'edit-server-modal',
		},
		{ type: 'delete', title: 'Delete' },
	],
};

const config = {
	fields,
	table: tableFields,
	form: formFields,
	route,
};

export default config;
