const fields = [
	'name',
	'url',
	'fileSize',
	'size',
	'folder',
	'key',
	'type',
	'fileType',
	'bucket',
	'isActive',
	'createdAt',
];

const tableFields = [
	'name',
	'url',
	'fileSize',
	'size',
	'folder',
	'key',
	'type',
	'fileType',
	'bucket',
	'isActive',
	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'Change Folder',
		fields: ['folder'],
	},
];

const config = {
	fields,
	table: tableFields,
	form: formFields,
};

export default config;
