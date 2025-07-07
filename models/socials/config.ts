const fields = ['name', 'description', 'slug', 'url', 'isActive'];

const tableFields = ['name', 'description', 'slug', 'url', 'isActive'];

const formFields = [
	{
		sectionTitle: 'Social Media Details',
		fields: ['name', 'url', 'isActive'],
	},
	{
		sectionTitle: 'Description',
		fields: ['description'],
	},
];

const route = {
	title: 'Social Media Accounts',
	subTitle: 'Manage your social media accounts here and connect with your audience.',
	path: 'socials',
	export: true,
	button: {
		title: 'Add Item',
		isModal: true,
	},

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
