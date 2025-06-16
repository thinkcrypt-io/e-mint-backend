const fields = [
	'code',
	'image',
	'name',
	'excerpt',
	'category',
	'author',
	'readTime',
	'slug',
	'status',
	'isFeatured',
	'content',
	'publishedAt',
	'tags',
	'coverImage',
	'images',
	'views',
	'likes',
	'allowComments',
	'seoScore',
	'contentScore',
	'metaTitle',
	'metaDescription',
	'metaKeywords',
	'createdAt',
];

const tableFields = [
	'code',
	'name',
	'category',
	'author',
	'readTime',
	'slug',
	'status',
	'isFeatured',
	'publishedAt',
	'views',
	'createdAt',
];

const formFields = [
	{
		sectionTitle: 'Blog Card(Basic Information)',
		fields: [
			'image',
			'name',
			'excerpt',
			['category', 'author'],
			['readTime', 'slug'],
			['status', 'isFeatured'],
		],
	},
	{
		sectionTitle: 'Blog Content',
		fields: ['coverImage', 'content'],
	},
	{
		sectionTitle: 'SEO',
		fields: ['metaTitle', 'metaDescription', 'metaKeywords'],
	},
	{
		sectionTitle: 'Advanced',
		fields: ['publishedAt', 'tags', 'images'],
	},
];

const config = {
	fields,
	table: tableFields,
	form: formFields,
};

export default config;
