const fields = ['name', 'description', 'path', 'fields', 'model', '_id', 'createdAt', 'updatedAt'];

const tableFields = ['name', 'path', 'model'];

const formFields = [
	{
		sectionTitle: 'Form Config Basic',
		fields: ['name', ['path', 'model']],
	},
	{
		sectionTitle: 'Select Fields',
		fields: ['fields'],
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
