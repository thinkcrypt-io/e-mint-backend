type SidebarItemType = {
	title: string;
	href: string;
	icon: string;
	path: string;
	startOfSection?: boolean;
	sectionTitle?: string;
	isLocked?: boolean;
	permission?: {
		hide?: boolean;
		key?: string;
		label?: string;
		options?: string[];
	};
};

const sidebar: SidebarItemType[] = [
	{
		title: 'Dashboard',
		href: '/',
		icon: 'dashboard',
		path: 'dashboard',
		permission: {
			key: 'analytics',
			label: 'Analytics',
			options: ['view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Analytics',
		title: 'Page Views',
		href: '/views',
		icon: 'analytics',
		path: 'views',
		permission: {
			key: 'views',
			label: 'Page Views',
			options: ['view', 'edit', 'delete'],
		},
	},
	{
		title: 'Click Events',
		href: '/clickevents',
		icon: 'clicks',
		path: 'clickevents',
		permission: {
			key: 'clickevents',
			label: 'Click Events',
			options: ['view', 'edit', 'delete'],
		},
	},

	{
		startOfSection: true,
		sectionTitle: 'Shop Management',
		title: 'Shops',
		href: '/shops',
		icon: 'shop',
		path: 'shops',
		permission: {
			key: 'shops',
			label: 'Mint Stores',
			options: ['view', 'edit'],
		},
	},
	{
		title: 'Packages',
		href: '/packages',
		icon: 'order',
		path: 'packages',
		permission: {
			key: 'packages',
			label: 'Mint Seller Packages',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'User',
		href: '/sellers',
		icon: 'order',
		path: 'sellers',
		permission: {
			key: 'sellers',
			label: 'Mint Retail Users',
			options: ['view', 'edit'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Data Management',
		title: 'Products',
		href: '/products',
		icon: 'product',
		path: 'products',
		permission: {
			key: 'products',
			label: 'Mint Store Products',
			options: ['view', 'edit', 'delete'],
		},
	},
	// {
	// 	title: 'Categories',
	// 	href: '/categories',
	// 	icon: 'category',
	// 	path: 'categories',
	// },

	{
		title: 'Customers',
		href: '/customers',
		icon: 'customer',
		path: 'customers',
		permission: {
			key: 'customers',
			label: 'Mint Customers',
			options: ['view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Theme',
		title: 'Themes',
		href: '/themes',
		icon: 'product',
		path: 'themes',
		permission: {
			key: 'themes',
			label: 'Mint Themes',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Purchases',
		href: '/purchased-themes',
		icon: 'purchase',
		path: 'purchased-themes',
		permission: {
			key: 'purchased-themes',
			label: 'Mint Theme Purchases',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		sectionTitle: 'Sales Management',
		startOfSection: true,
		title: 'Leads',
		href: '/leads',
		icon: 'customer',
		path: 'leads',
		permission: {
			key: 'leads',
			label: 'Leads Management',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'FB Groups',
		href: '/fgroups',
		icon: 'facebook',
		path: 'fgroups',
		permission: {
			key: 'gfroups',
			label: 'Facebook Groups',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Email',
		href: '/emails',
		icon: 'email',
		path: 'emails',
		permission: {
			key: 'emails',
			label: 'Email',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Project Management',
		title: 'Projects',
		href: '/projects',
		icon: 'project',
		path: 'projects',
		permission: {
			key: 'projects',
			label: 'Projects',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Git Repos',
		href: '/repos',
		icon: 'repo',
		path: 'repos',
		permission: {
			key: 'repos',
			label: 'Project Repositories',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Issues',
		href: '/issues',
		icon: 'customer',
		path: 'issues',
		permission: {
			key: 'issues',
			label: 'Issues',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Media',
		title: 'Files',
		href: '/files',
		icon: 'files',
		path: 'files',
		permission: {
			key: 'files',
			label: 'Files',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},

	{
		startOfSection: true,
		sectionTitle: 'Admin Management',
		title: 'Admin List',
		href: '/admins',
		icon: 'customer',
		path: 'admins',
		permission: {
			key: 'admins',
			label: 'Admin Users',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Roles',
		href: '/adminroles',
		icon: 'role',
		path: 'adminroles',
		permission: {
			key: 'adminroles',
			label: 'Admin Roles',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Clients',
		href: '/clients',
		icon: 'customer',
		path: 'clients',
		permission: {
			key: 'clients',
			label: 'Clients',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},

	{
		title: 'Meetings',
		href: '/meetings',
		icon: 'meeting',
		path: 'meetings',
		permission: {
			key: 'meetings',
			label: 'Meetings',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Documents',
		href: '/documents',
		icon: 'document',
		path: 'documents',
		permission: {
			key: 'documents',
			label: 'Documents',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Maintenance',
		href: '/maintenances',
		icon: 'mainteinance',
		path: 'maintenances',
		permission: {
			key: 'maintenances',
			label: 'Maintenance Contracts',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Career',
		title: 'Job Posts',
		href: '/jobposts',
		icon: 'customer',
		path: 'jobposts',
		permission: {
			key: 'jobposts',
			label: 'Job Postings',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Applications',
		href: '/jobapplications',
		icon: 'customer',
		path: 'jobapplications',
		permission: {
			key: 'jobapplications',
			label: 'Job Applications',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Accounts',
		title: 'Invoices',
		href: '/invoices',
		icon: 'invoice',
		path: 'invoices',
		permission: {
			key: 'invoices',
			label: 'Invoices',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Expenses',
		href: '/expenses',
		icon: 'expense',
		path: 'expenses',
		permission: {
			key: 'expenses',
			label: 'Expenses',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Bills',
		href: '/bills',
		icon: 'customer',
		path: 'bills',
		permission: {
			key: 'bolls',
			label: 'Bills',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Subscriptions',
		href: '/subscriptions',
		icon: 'customer',
		path: 'subscriptions',
		permission: {
			key: 'subscriptions',
			label: 'Subscriptions',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'HR',
		title: 'Employees',
		href: '/employees',
		icon: 'employee',
		path: 'employees',
		permission: {
			key: 'employees',
			label: 'Employees',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Leave Management',
		href: '/leaves',
		icon: 'customer',
		path: 'leaves',
		permission: {
			key: 'leaves',
			label: 'Leaves',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Framework Doc',
		title: 'Components',
		href: '/components',
		icon: 'customer',
		path: 'components',
		permission: {
			key: 'components',
			label: 'Framework Components',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Props',
		href: '/props',
		icon: 'customer',
		path: 'props',
		permission: {
			key: 'props',
			label: 'Framework Props',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Planning',
		title: 'Project Planning',
		href: '/plannedprojects',
		icon: 'customer',
		path: 'plannedprojects',
		permission: {
			key: 'plannedprojects',
			label: 'Project Planning',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Plan Model',
		href: '/plannedmodels',
		icon: 'customer',
		path: 'plannedmodels',
		permission: {
			key: 'plannedmodels',
			label: 'Model Planning',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Model Fields',
		href: '/modelattributes',
		icon: 'customer',
		path: 'modelattributes',
		permission: {
			key: 'modelattributes',
			label: 'Model Fields',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	// {
	// 	title: 'Plan Feature',
	// 	href: '/plannedfeatures',
	// 	icon: 'customer',
	// 	path: 'plannedfeatures',
	// },
	// {
	// 	title: 'Plan Page',
	// 	href: '/plannedpages',
	// 	icon: 'customer',
	// 	path: 'plannedpages',
	// },

	{
		startOfSection: true,
		sectionTitle: 'Website Settings',
		title: 'Featured Projects',
		href: '/portfolios',
		icon: 'customer',
		path: 'portfolios',
		permission: {
			key: 'portfolios',
			label: 'Website Portfolio Projects',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Team Members',
		href: '/teams',
		icon: 'customer',
		path: 'teams',
		permission: {
			key: 'teams',
			label: 'Website Team Members',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Services',
		href: '/services',
		icon: 'customer',
		path: 'services',
		permission: {
			key: 'services',
			label: 'Service Offerings (Website)',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Clients',
		href: '/tcclients',
		icon: 'customer',
		path: 'tcclients',
		permission: {
			key: 'tcclients',
			label: 'Clients (Website)',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Solution List',
		href: '/solutions',
		icon: 'customer',
		path: 'solutions',
		permission: {
			key: 'solitions',
			label: 'Solutions (Website)',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},

	{
		startOfSection: true,
		sectionTitle: 'Website Components',
		title: 'Service Offers',
		href: '/offers',
		icon: 'customer',
		path: 'offers',
		permission: {
			key: 'offers',
			label: 'Service Offers (Website)',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Offer Category',
		href: '/servicecat',
		icon: 'customer',
		path: 'servicecat',
		permission: {
			key: 'servicecat',
			label: 'Service Offer Categories (Website)',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},

	{
		title: 'Service Features',
		href: '/features',
		icon: 'customer',
		path: 'features',
		permission: {
			key: 'features',
			label: 'Service Features (Website)',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Tech Stacks',
		href: '/techstacks',
		icon: 'customer',
		path: 'techstacks',
		permission: {
			key: 'techstacks',
			label: 'Technology Stacks (Website)',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'TC Blog',
		title: 'Blog',
		href: '/blogs',
		icon: 'blog',
		path: 'blogs',
		permission: {
			key: 'blogs',
			label: 'Blog Posts',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Author',
		href: '/authors',
		icon: 'author',
		path: 'authors',
		permission: {
			key: 'authors',
			label: 'Blog Authors',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Resources',
		title: 'Dev Resources',
		href: '/resources',
		icon: 'settings-fill',
		path: 'resources',
		permission: {
			key: 'resources',
			label: 'Developer Resources',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		title: 'Npm Packages',
		href: '/npmlibraries',
		icon: 'npm',
		path: 'npmlibraries',
		permission: {
			key: 'npmlibraries',
			label: 'NPM Libraries',
			options: ['create', 'view', 'edit', 'delete'],
		},
	},
	{
		startOfSection: true,
		sectionTitle: 'Admin Settings',
		title: 'Sidebar Item',
		href: '/sidebaritems',
		icon: 'sidebaritems',
		path: 'sidebaritems',
	},
	{
		title: 'Sidebar Categories',
		href: '/sidebarcategories',
		icon: 'sidebarcategories',
		path: 'sidebarcategories',
	},

	{
		startOfSection: true,
		sectionTitle: 'Account Settings',
		title: 'Settings',
		href: '/settings',
		icon: 'settings-fill',
		path: 'settings',
		permission: {
			hide: true,
		},
	},
];

export default sidebar;
