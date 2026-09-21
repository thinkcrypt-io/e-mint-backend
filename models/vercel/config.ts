const fields = [
	'code',
	'label',
	'userEmail',
	'username',
	'displayName',
	'tokenLast4',
	'plan',
	'status',
	'projectCount',
	'defaultTeamId',
	'client',
	'project',
	'lastSyncedAt',
	'note',
	'createdAt',
];

const tableFields = [
	'code',
	'label',
	'userEmail',
	'plan',
	'status',
	'projectCount',
	'client',
	'lastSyncedAt',
];

const formFields = [
	{
		sectionTitle: 'Account',
		fields: ['label', 'apiToken'],
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
	title: 'Vercel Accounts',
	subTitle: 'Connected Vercel accounts, their projects, deployments and environment.',
	path: 'vercels',
	button: {
		title: 'Connect Account',
		isModal: true,
	},
	export: false,
	clickable: true,
	toPath: '/vercels',
	guideHref: '/vercel-doc',
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
