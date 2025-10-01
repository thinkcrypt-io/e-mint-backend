const fields = [
	'name',
	'description',
	'isDisabled',
	'path',
	'formFields',
	'sch',
	'tableFields',
	'viewFields',
	'_id',
	'createdAt',
	'updatedAt',
];

const tableFields = ['name', 'path', 'isDisabled', 'sch'];

const formFields = [
	{
		sectionTitle: 'Form Config Basic',
		fields: [
			['name', 'isDisabled'],
			['path', 'sch'],
		],
	},
	{
		sectionTitle: 'Form Fields',
		description: 'Select fields to show in form view',
		fields: ['formFields'],
	},
	{
		sectionTitle: 'Table Fields',
		description: 'Select fields to show in table view',
		fields: ['tableFields'],
	},

	{
		sectionTitle: 'View Fields',
		description: 'Select fields to show in view mode',
		fields: ['viewFields'],
	},
	{
		sectionTitle: 'Other Details',
		fields: ['description'],
	},
];

const route = {
	title: 'Form Configs',
	subTitle: 'Manage the form configuration, what fields to show in a form and in what order',
	path: 'formfields',
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
