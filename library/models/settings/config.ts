const fields = [
	'name',
	'description',
	'isDisabled',
	'path',
	'fields',
	'sch',
	'_id',
	'createdAt',
	'updatedAt',
];

const tableFields = ['name', 'path', 'isDisabled', 'sch'];

const formFields = [
	{
		sectionTitle: 'Settings Basic',
		fields: [
			['name', 'isDisabled'],
			['path', 'sch'],
		],
	},
	{
		sectionTitle: 'Settings Array',
		fields: ['fields'],
	},

	{
		sectionTitle: 'Other Details',
		fields: ['description'],
	},
];

const route = {
	title: 'Settings',
	path: 'setting',
	button: {
		title: 'Add Setting',
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
