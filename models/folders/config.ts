const fields = ['name', 'description', 'parent', 'isActive', 'priority', 'slug', 'createdAt'];

const tableFields = ['name', 'parent', 'isActive', 'priority', 'slug', 'createdAt'];

const formFields = [
	{
		sectionTitle: 'Folder Details',
		fields: ['name', 'slug', ['isActive', 'parent']],
	},
	{
		sectionTitle: 'Description',
		fields: ['description'],
	},
	{
		sectionTitle: 'Organization & Display',
		fields: ['priority'],
	},
];

const route = {
	title: 'Folders',
	subTitle: 'Manage your folders',
	path: 'folders',
	button: {
		title: 'New Folder',
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
