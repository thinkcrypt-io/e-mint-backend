type SidebarItemType = {
	title: string;
	href: string;
	icon: string;
	path: string;
	startOfSection?: boolean;
	sectionTitle?: string;
};

const sidebar: SidebarItemType[] = [
	{
		title: 'Dashboard',
		href: '/',
		icon: 'dashboard',
		path: 'dashboard',
	},
	{
		startOfSection: true,
		sectionTitle: 'Analytics',
		title: 'Page Views',
		href: '/views',
		icon: 'analytics',
		path: 'views',
	},
	{
		title: 'Click Events',
		href: '/clickevents',
		icon: 'clicks',
		path: 'clickevents',
	},

	{
		startOfSection: true,
		sectionTitle: 'Shop Management',
		title: 'Shops',
		href: '/shops',
		icon: 'shop',
		path: 'shops',
	},
	{
		title: 'Packages',
		href: '/packages',
		icon: 'order',
		path: 'packages',
	},
	{
		title: 'User',
		href: '/sellers',
		icon: 'order',
		path: 'sellers',
	},
	{
		startOfSection: true,
		sectionTitle: 'Data Management',
		title: 'Products',
		href: '/products',
		icon: 'product',
		path: 'products',
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
	},
	{
		startOfSection: true,
		sectionTitle: 'Theme',
		title: 'Themes',
		href: '/themes',
		icon: 'product',
		path: 'themes',
	},
	{
		title: 'Purchases',
		href: '/purchased-themes',
		icon: 'purchase',
		path: 'purchased-themes',
	},
	{
		sectionTitle: 'Sales Management',
		startOfSection: true,
		title: 'Leads',
		href: '/leads',
		icon: 'customer',
		path: 'leads',
	},
	{
		title: 'FB Groups',
		href: '/fgroups',
		icon: 'facebook',
		path: 'fgroups',
	},
	{
		title: 'Email',
		href: '/emails',
		icon: 'email',
		path: 'emails',
	},
	{
		startOfSection: true,
		sectionTitle: 'Project Management',
		title: 'Projects',
		href: '/projects',
		icon: 'project',
		path: 'projects',
	},
	{
		title: 'Git Repos',
		href: '/repos',
		icon: 'repo',
		path: 'repos',
	},
	{
		title: 'Issues',
		href: '/issues',
		icon: 'customer',
		path: 'issues',
	},

	{
		startOfSection: true,
		sectionTitle: 'Admin Management',
		title: 'Admin List',
		href: '/admins',
		icon: 'customer',
		path: 'admins',
	},
	{
		title: 'Roles',
		href: '/adminroles',
		icon: 'role',
		path: 'adminroles',
	},
	{
		title: 'Clients',
		href: '/clients',
		icon: 'customer',
		path: 'clients',
	},

	{
		title: 'Meetings',
		href: '/meetings',
		icon: 'meeting',
		path: 'meetings',
	},
	{
		title: 'Documents',
		href: '/documents',
		icon: 'document',
		path: 'documents',
	},
	{
		title: 'Maintenance',
		href: '/maintenances',
		icon: 'mainteinance',
		path: 'maintenances',
	},
	{
		startOfSection: true,
		sectionTitle: 'Career',
		title: 'Job Posts',
		href: '/jobposts',
		icon: 'customer',
		path: 'jobposts',
	},
	{
		title: 'Applications',
		href: '/jobapplications',
		icon: 'customer',
		path: 'jobapplications',
	},
	{
		startOfSection: true,
		sectionTitle: 'Accounts',
		title: 'Invoices',
		href: '/invoices',
		icon: 'invoice',
		path: 'invoices',
	},
	{
		title: 'Expenses',
		href: '/expenses',
		icon: 'expense',
		path: 'expenses',
	},
	{
		title: 'Bills',
		href: '/bills',
		icon: 'customer',
		path: 'bills',
	},
	{
		title: 'Subscriptions',
		href: '/subscriptions',
		icon: 'customer',
		path: 'subscriptions',
	},
	{
		startOfSection: true,
		sectionTitle: 'HR',
		title: 'Employees',
		href: '/employees',
		icon: 'employee',
		path: 'employees',
	},
	{
		title: 'Leave Management',
		href: '/leaves',
		icon: 'customer',
		path: 'leaves',
	},
	{
		startOfSection: true,
		sectionTitle: 'Framework Doc',
		title: 'Components',
		href: '/components',
		icon: 'customer',
		path: 'components',
	},
	{
		title: 'Props',
		href: '/props',
		icon: 'customer',
		path: 'props',
	},
	{
		startOfSection: true,
		sectionTitle: 'Planning',
		title: 'Plan Project',
		href: '/plannedprojects',
		icon: 'customer',
		path: 'plannedprojects',
	},
	{
		title: 'Plan Model',
		href: '/plannedmodels',
		icon: 'customer',
		path: 'plannedmodels',
	},
	{
		title: 'Model Fields',
		href: '/modelattributes',
		icon: 'customer',
		path: 'modelattributes',
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
	},
	{
		title: 'Team Members',
		href: '/teams',
		icon: 'customer',
		path: 'teams',
	},
	{
		title: 'Services',
		href: '/services',
		icon: 'customer',
		path: 'services',
	},
	{
		title: 'Clients',
		href: '/tcclients',
		icon: 'customer',
		path: 'tcclients',
	},
	{
		title: 'Solution List',
		href: '/solutions',
		icon: 'customer',
		path: 'solutions',
	},

	{
		startOfSection: true,
		sectionTitle: 'Website Components',
		title: 'Service Offers',
		href: '/offers',
		icon: 'customer',
		path: 'offers',
	},
	{
		title: 'Offer Category',
		href: '/servicecat',
		icon: 'customer',
		path: 'servicecat',
	},

	{
		title: 'Service Features',
		href: '/features',
		icon: 'customer',
		path: 'features',
	},
	{
		title: 'Tech Stacks',
		href: '/techstacks',
		icon: 'customer',
		path: 'techstacks',
	},
	{
		startOfSection: true,
		sectionTitle: 'TC Blog',
		title: 'Blog',
		href: '/blogs',
		icon: 'blog',
		path: 'blogs',
	},
	{
		title: 'Author',
		href: '/authors',
		icon: 'author',
		path: 'authors',
	},
	{
		startOfSection: true,
		sectionTitle: 'Resources',
		title: 'Dev Resources',
		href: '/resources',
		icon: 'settings-fill',
		path: 'resources',
	},
	{
		title: 'Npm Packages',
		href: '/npmlibraries',
		icon: 'npm',
		path: 'npmlibraries',
	},

	{
		startOfSection: true,
		sectionTitle: 'Account Settings',
		title: 'Settings',
		href: '/settings',
		icon: 'settings-fill',
		path: 'settings',
	},
];

export default sidebar;
