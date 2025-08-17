const fields = [
	'code',
	'name',
	'client',
	'clientLocation',
	'status',
	'category',
	'estimatedValue',
	'agreedValue',
	'currency',
	'estimatedStartDate',
	'timeline',
	'description',
	'riskLevel',
	'closedReason',
	'priority',
	'tags',
	'note',
	'document',
	'source',
	'requirements',
	'quotation',
	'lastInteractionDate',
	'interactionSummary',
	'createdAt',
];

const tableFields = [
	'code',
	'name',
	'client',
	'clientLocation',
	'status',
	'category',
	'estimatedValue',
	'agreedValue',
	'currency',
	'estimatedStartDate',
	'timeline',
	'riskLevel',
	'priority',
	'source',
	'lastInteractionDate',
	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'Project Details',
		fields: ['name', ['status', 'category'], ['source', 'priority']],
	},
	{
		sectionTitle: 'Client information',
		fields: [['client', 'clientLocation'], 'lastInteractionDate'],
	},
	{
		sectionTitle: 'Timeline & Value',
		fields: [
			['estimatedValue', 'agreedValue'],
			['currency', 'riskLevel'],
			['estimatedStartDate', 'timeline'],
		],
	},
	{
		sectionTitle: 'Project Description',
		fields: ['description'],
	},
	{
		sectionTitle: 'Relevant Documents',
		fields: ['document', 'requirements', 'quotation'],
	},
	{
		sectionTitle: 'Interaction Summary',
		fields: ['interactionSummary', 'closedReason'],
	},
	{
		sectionTitle: 'Other Information',
		fields: ['note', 'tags'],
	},
	{
		sectionTitle: 'Privacy & Access',
		fields: ['privacy', 'access'],
	},
];

const route = {
	title: 'Prospect Project',
	subTitle: 'Manage the prospect projects',
	path: 'prospects',
	button: {
		title: 'Add Prospect',
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
