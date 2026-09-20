const fields = [
	'code',
	'name',
	'position',
	'status',
	'endDate',
	'department',
	'type',
	'location',
	'excerpt',
];

const tableFields = [
	'code',
	'name',
	'position',
	'status',
	'endDate',
	'department',
	'type',
	'location',
	'excerpt',
];

const formFields = [
	{
		sectionTitle: 'Job Details',
		fields: ['name', ['position', 'location'], ['department', 'type'], ['status', 'endDate']],
	},
	{
		sectionTitle: 'Additional Info',
		fields: ['excerpt'],
	},
	{
		sectionTitle: 'Description',
		fields: ['description', 'status'],
	},
];

const route = {
	title: 'Vacancies',
	subTitle: 'Post and manage jobs for website here',
	path: 'vacancies',
	button: {
		title: 'New Vacancy',
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
