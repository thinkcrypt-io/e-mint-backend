const fields = [
	'code',
	'page',
	'slug',
	'isActive',
	'title',
	'description',
	'keywords',

	'canonicalUrl',
	'ogImage',
	'ogTitle',
	'ogDescription',
	'ogType',
	'twitterTitle',
	'twitterDescription',
	'twitterImage',
	'twitterCard',
	'createdAt',
];

const tableFields = [
	'code',
	'page',
	'slug',
	'isActive',

	'title',
	'canonicalUrl',

	'ogTitle',

	'ogType',
	'twitterTitle',

	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'SEO Overview',
		fields: ['page', ['slug', 'isActive']],
	},
	{
		sectionTitle: 'Basic SEO',
		fields: ['title', 'description', 'keywords'],
	},
	{
		sectionTitle: 'URL Settings',
		fields: ['canonicalUrl'],
	},
	{
		sectionTitle: 'Open Graph (Facebook, LinkedIn, etc.)',
		fields: ['ogImage', 'ogTitle', 'ogDescription', 'ogType'],
	},
	{
		sectionTitle: 'Twitter Card',
		fields: ['twitterTitle', 'twitterDescription', 'twitterImage', 'twitterCard'],
	},
];

const route = {
	title: 'SEO Management',
	subTitle: `Manage your website\'s SEO settings, including meta tags, Open Graph, and Twitter Card information.`,
	path: 'metas',
	button: {
		title: 'Add Meta',
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
