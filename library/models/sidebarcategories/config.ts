const fields = [
	'icon',
	'name',
	// 'shortName',
	'isActive',
	'priority',
	// 'tooltip',
	'description',
	// 'accessLevel',
	'notes',
];

const tableFields = ['icon', 'name', 'isActive', 'priority'];

const formFields = [
	{
		sectionTitle: 'Sidebar Category',
		fields: ['icon', 'name', ['isActive', 'priority']],
	},
	{
		sectionTitle: 'Sidebar Category Description',
		fields: ['description'],
	},
	{
		sectionTitle: 'Additional Notes',
		fields: ['notes'],
	},
];

const config = {
	fields,
	table: tableFields,
	form: formFields,
};

export default config;
