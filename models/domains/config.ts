const fields = [
	'code',
	'name',
	'url',
	'status',
	'purchasePrice',
	'renewalPrice',
	'purchaseDate',
	'renewalDate',
	'expiryDate',
	'autoRenew',
	'provider',
	'providerUrl',
	'accountId',
	'note',
];

const tableFields = [
	'code',
	'name',
	'url',
	'status',
	'purchasePrice',
	'renewalPrice',
	'purchaseDate',
	'renewalDate',
	'expiryDate',
	'autoRenew',
	'provider',
];

const formFields = [
	{
		sectionTitle: 'Domain Details',
		fields: ['name', 'url', ['status', 'autoRenew']],
	},
	{
		sectionTitle: 'Purchase Details',
		fields: [['purchasePrice', 'renewalPrice'], ['purchaseDate', 'renewalDate'], 'expiryDate'],
	},
	{
		sectionTitle: 'Provider Details',
		fields: ['provider', ['providerUrl', 'accountId']],
	},
	{
		sectionTitle: 'Notes',
		fields: ['note'],
	},
];

const route = {
	title: 'Domain Management',
	subTitle: 'Manage your domains here',
	path: 'domains',
	button: {
		title: 'Add Domain',
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
