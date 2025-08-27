const fields = [
	'code',
	'name',
	'url',
	'connectedDomain',
	'category',
	'version',
	'gitRepo',
	'branch',
	'environment',
	'gitAccount',
	'isActive',
	'project',
	'client',
	'hosting',
	'note',
	'createdAt',
];

const tableFields = [
	'code',
	'name',
	'url',
	'connectedDomain',
	'category',
	'version',
	'gitRepo',
	'isActive',
	'project',
	'hosting',
	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'URL Information',
		fields: ['name', ['url', 'connectedDomain'], ['category', 'version'], ['isActive', 'hosting']],
	},
	{
		sectionTitle: 'Git Information',
		fields: [
			['gitRepo', 'gitAccount'],
			['branch', 'environment'],
		],
	},
	{
		sectionTitle: 'Project/Client Information',
		fields: [['project', 'client']],
	},
	{
		sectionTitle: 'Additional Information',
		fields: ['note'],
	},
];

const route = {
	title: 'Project URLs',
	subTitle:
		'This page maintains a centralized list of all client and internal project URLs. Quickly access frontend, backend, staging, and demo links, track their status (live, test, or demo), and reference related Git repositories and deployment environments. Everything your team needs to stay organized is in one place.',
	path: 'urls',
	button: {
		title: 'Add URL',
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
