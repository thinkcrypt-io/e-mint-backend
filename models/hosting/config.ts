const fields = ['code', 'name', 'accountEmail', 'type', 'status', 'notes', 'createdAt'];

const tableFields = ['code', 'name', 'accountEmail', 'type', 'status', 'createdAt'];

const formFields = [
	{
		sectionTitle: 'Hosting Details',
		fields: [
			['name', 'accountEmail'],
			['type', 'status'],
		],
	},
	{
		sectionTitle: 'Additional Information',
		fields: ['notes'],
	},
];

const route = {
	title: 'Hosting Details',
	subTitle:
		'Keep track of all hosting platforms, accounts, regions, and plans in one place. This central directory helps our team quickly find deployment environments, manage client vs. internal accounts, and maintain transparency across projects.',
	path: 'hostings',
	button: {
		title: 'Add Hosting',
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
