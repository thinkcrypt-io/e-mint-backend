const fields = [
	'name',
	'url',
	'fileSize',
	'size',
	'folder',
	'key',
	'type',
	'fileType',
	'bucket',
	'isActive',
	'createdAt',
];

const tableFields = [
	'name',
	'url',
	'fileSize',
	'size',
	'folder',
	'key',
	'type',
	'fileType',
	'bucket',
	'isActive',
	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'Change Folder',
		fields: ['folder'],
	},
];

const route = {
	title: 'File Management',
	path: 'files',

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
	route: route,
};

export default config;
