const fields = ['name', 'description', 'permissions', 'isActive', 'createdAt'];
const tableFields = ['name', 'isActive', 'createdAt'];

const formFields = [
	{
		sectionTitle: 'Role Basics',
		fields: ['name', 'description', 'isactive'],
	},
	{
		sectionTitle: 'Role Permissions',
		fields: ['permissions'],
	},
];

const config = {
	fields,
	table: tableFields,
	form: formFields,
};

export default config;
