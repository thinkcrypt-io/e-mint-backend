const fields = [
	'name',
	'route',
	'model',
	'description',
	'filterLabels',
	'_id',
	'createdAt',
	'updatedAt',
];

const tableFields = ['name', 'route', 'model', 'filters', 'filterLabels', 'updatedAt'];

// Unused by the admin — filters are edited on their own page, not in a
// generated form — but `getConfig` expects every route to declare one.
const formFields = [
	{
		sectionTitle: 'Filter Config',
		fields: [['name', 'route'], 'model', 'description'],
	},
];

const route = {
	title: 'Routes',
	subTitle: 'Each admin table: its filter chips, and for generic routes its columns and header buttons',
	path: 'filterconfigs',
	// Create and edit both happen on the card editor page rather than in a
	// modal: a route's filters are an ordered list of cards, which a generated
	// form has no way to lay out or reorder.
	button: {
		title: 'Add Route',
		path: '/filterconfigs/create',
	},
	clickable: true,
	toPath: '/filterconfigs/edit',
	export: true,

	menu: [
		{ type: 'edit', title: 'Edit Filters' },
		{ type: 'view-server-modal', title: 'View' },
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
