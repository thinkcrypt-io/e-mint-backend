const fields = ['code', 'name', 'route', 'isActive', 'description', 'createdAt'];

const tableFields = ['code', 'name', 'route', 'isActive', 'createdAt'];

const formFields = [
	{
		sectionTitle: 'Model Information',
		fields: ['name', ['route', 'isActive']],
	},
	{
		sectionTitle: 'Additional Information',
		fields: ['description'],
	},
];

const route = {
	title: 'DB Models',
	subTitle: 'Manage Database Models',
	path: 'models',
	button: {
		title: 'New Model',
		isModal: true,
	},
	export: true,

	menu: [
		{ type: 'view-server-modal', title: 'View' },
		{ type: 'view-item', title: 'Go To Post' },
		{
			title: 'Edit Details',
			type: 'edit-server-modal',
		},
	],
};

const config = {
	fields,
	table: tableFields,
	form: formFields,
	route,
};

export default config;
