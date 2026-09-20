export const fields = [
	'code',
	'name',
	'description',
	'items',
	'status',
	'docType',
	'client',
	'clientEmail',
	'clientPhone',
	'clientAddress',
	'project',
	'issueDate',
	'dueDate',
	'subTotal',
	'tax',
	'shipping',
	'others',
	'currency',
	'total',
	'paymentMethod',
	'amountInWords',
	'bank.accountName',
	'bank.accountNo',
	'bank.bankName',
	'bank.branch',
	'access',
	'note',
	'authorizedBy',
	'billFromOverride',
	'addedBy',
	'createdAt',
];
export const tableFields = [
	'code',
	'name',
	'status',
	'docType',
	'currency',
	'total',
	'issueDate',
	'dueDate',
	'client',
	'project',
	'addedBy',
];
export const formFields: any = [
	{
		sectionTitle: 'Invoice Details',
		fields: ['name', ['status', 'docType'], ['issueDate', 'dueDate']],
	},
	{
		sectionTitle: 'Items',
		fields: ['description', 'items'],
	},
	// {
	// 	sectionTitle: 'Invoice Issue & Due',
	// 	description: 'Date of the invoice being issues and when the invpice is due',
	// 	fields: [['issueDate', 'dueDate']],
	// 	collapsible: true,
	// },
	{
		sectionTitle: 'Price & Total',
		fields: [
			['subTotal', 'tax'],
			['shipping', 'others'],
			'currency',
			'total',
			'paymentMethod',
			'amountInWords',
		],
	},
	{
		sectionTitle: 'Bank Details',
		fields: [
			['bank.accountName', 'bank.accountNo'],
			['bank.bankName', 'bank.branch'],
		],
	},
	{
		sectionTitle: 'Client/Project',
		fields: [['client', 'project']],
	},
	{
		sectionTitle: 'For Internal Use',
		collapsible: true,
		fields: ['note', 'access', 'authorizedBy', 'billFromOverride'],
	},
];

const route: any = {
	title: 'Invoice',
	path: 'invoices',
	export: true,

	button: {
		title: 'New Invoice',
		isModal: true,
		layout: formFields,
	},
	fields: tableFields,
	select: {
		show: true,
		menu: [
			{
				type: 'calculate',
				title: 'Calculate Values',
			},
		],
	},

	menu: [
		{ type: 'view-modal', title: 'View', fields },
		{ type: 'view-item', title: 'Go To Post' },

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
