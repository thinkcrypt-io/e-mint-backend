const fields = [
	'code',
	'name',
	'userid',
	'pass',
	'key',
	'value',
	'category',

	'platform',
	'url',
	'description',
	'client',
	'project',
	'privacy',
	'note',
	'addedBy',
	'access',
	'createdAt',
	'updatedAt',
];

const tableFields = [
	'code',
	'name',
	'userid',
	'pass',
	'key',
	'value',
	'category',
	'platform',
	'url',
	'client',
	'project',
	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'Credential Details',
		fields: [
			['name', 'category'],
			['userid', 'pass'],
			['key', 'value'],
			['platform', 'url'],
			'description',
		],
	},
	{
		sectionTitle: 'Additional Information',
		fields: [['client', 'project']],
	},
	{
		sectionTitle: 'Privacy & Access',
		fields: ['privacy', 'access'],
	},
	{
		sectionTitle: 'Internal Notes',
		fields: ['note'],
	},
];

const route = {
	title: 'Credentials',
	subTitle: 'Manage your credentials',
	path: 'credential',
	button: {
		title: 'New Credential',
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
