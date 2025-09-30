const fields = [
	'name',
	'description',
	'path',
	'formFields',
	'schema',
	'model',
	'_id',
	'createdAt',
	'updatedAt',
];

const tableFields = ['name', 'path', 'schema', 'model'];

const formFields = [
	{
		sectionTitle: 'Form Config Basic',
		fields: ['name', ['path', 'schema']],
	},
	{
		sectionTitle: 'Select Fields',
		fields: ['formFields'],
	},
	{
		sectionTitle: 'Other Details',
		fields: ['description'],
	},
];

const route = {
	title: 'Form Configs',
	subTitle: 'Manage the form configuration, what fields to show in a form and in what order',
	path: 'formconfigs',
	button: {
		title: 'Add Form',
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
