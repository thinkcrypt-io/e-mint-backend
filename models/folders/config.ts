const fields = ['sample'];

const tableFields = ['sample'];

const formFields = [
	{
		sectionTitle: 'Sample',
		fields: ['sample', 'sample', ['sample', 'sample']],
	},
];

const route = {
	title: 'Route Title',
	subTitle: 'Route Subtitle',
	path: 'blogs',
	button: {
		title: 'New Blog',
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
