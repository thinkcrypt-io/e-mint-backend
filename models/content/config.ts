const fields = ['name', 'title', 'slug', 'contentType', 'status', 'content.data', 'tags', 'isActive', 'createdAt'];

const tableFields = ['name', 'contentType', 'status', 'slug', 'createdAt'];

const formFields: any = [
	{
		sectionTitle: 'Content Details',
		fields: ['name', 'title', ['slug', 'contentType'], 'status'],
	},
	{
		sectionTitle: 'Data',
		fields: ['content.data'],
	},
	{
		sectionTitle: 'Additional Info',
		collapsible: true,
		fields: ['tags', 'isActive'],
	},
];

const route: any = {
	title: 'Content',
	subTitle: 'Site content and settings documents, looked up by slug',
	path: 'contents',
	button: {
		title: 'New Content',
		isModal: true,
		layout: formFields,
	},
	fields: tableFields,
	export: true,

	menu: [
		{ type: 'view-modal', title: 'View', fields },
		{
			type: 'edit-modal',
			title: 'Edit',
			layout: formFields,
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
