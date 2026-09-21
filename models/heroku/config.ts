const fields = [
	'code',
	'label',
	'accountEmail',
	'accountName',
	'keyLast4',
	'status',
	'appCount',
	'isVerified',
	'twoFactor',
	'defaultTeam',
	'client',
	'project',
	'lastSyncedAt',
	'note',
	'createdAt',
];

const tableFields = ['code', 'label', 'accountEmail', 'status', 'appCount', 'client', 'lastSyncedAt'];

const formFields = [
	{
		sectionTitle: 'Account',
		fields: ['label', 'apiKey'],
	},
	{
		sectionTitle: 'Ownership',
		fields: [['client', 'project']],
	},
	{
		sectionTitle: 'Privacy & Access',
		fields: ['privacy', 'access'],
	},
	{
		sectionTitle: 'Notes',
		fields: ['note'],
	},
];

const route = {
	title: 'Heroku Accounts',
	subTitle: 'Connected Heroku accounts, their apps, and app config vars.',
	path: 'herokus',
	button: {
		title: 'Connect Account',
		isModal: true,
	},
	export: false,
	clickable: true,
	toPath: '/herokus',
	guideHref: '/heroku-doc',
	guideLabel: 'View the guide',

	menu: [
		{ type: 'view-server-modal', title: 'Quick View' },
		{ type: 'view', title: 'Open Account' },
		{ title: 'Edit Details', type: 'edit-server-modal' },
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
