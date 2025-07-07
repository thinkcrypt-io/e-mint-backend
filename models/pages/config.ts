const fields = [
	'name',
	'subTitle',
	'path',
	'export',
	'showAddButton',
	'buttonTitle',
	'buttonIsModal',
	'createdAt',
	'updatedAt',
];

const tableFields = [
	'name',
	'subTitle',
	'path',
	'export',
	'showAddButton',
	'buttonTitle',
	'buttonIsModal',
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
			['buttonTitle', 'buttonIsModal'],
		],
	},
];

const route = {
	title: 'Page Route Management',
	subTitle: 'Manage your page routes and their configurations',
	path: 'pages',

	button: {
		title: 'New Route',
		isModal: true,
	},

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
	// route,
};

export default config;
