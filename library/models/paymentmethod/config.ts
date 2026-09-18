const fields = [
	'accountName',
	'accountNumber',
	'bankName',
	'branch',
	'routingNumber',
	'isDefault',
	'isActive',
];

const tableFields = ['accountName', 'accountNumber', 'bankName', 'isDefault', 'isActive'];

const formFields: any = [
	{
		sectionTitle: 'Bank Account',
		fields: [['accountName', 'accountNumber'], ['bankName', 'branch'], 'routingNumber', ['isDefault', 'isActive']],
	},
];

const route: any = {
	title: 'Payment Methods',
	path: 'paymentmethods',
	export: true,
	button: {
		title: 'New Bank Account',
		isModal: true,
		layout: formFields,
	},
	fields: tableFields,
	menu: [
		{ type: 'edit-modal', title: 'Edit', layout: formFields },
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
