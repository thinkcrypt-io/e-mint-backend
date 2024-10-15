export const data: any = [
	'product',
	'category',
	'brand',
	'order',
	'purchase',
	'inventory',
	'user',
	'role',
	'customer',
	'supplier',
	'collection',
	'content',
	'expense',
	'payment',
	'return',
	'delivery',
	'ledger',
	'shop',
	'invoice',
	'settings',
	'coupon',
	// 'feedback',
	// 'notification',
	// 'banner',
	// 'offer',
	// 'wishlist',
	// 'cart',
	// 'address',
	// 'comment',
	// 'rating',
	// 'contact',
	// 'page',
	// 'blog',
	// 'faq',
	// 'policy',
	// 'terms',
	// 'condition',
	// 'about',
	// 'contact',
	// 'privacy',
	// 'profile',
	// 'account',
	// 'password',
	// 'login',
	// 'register',
	// 'forgot',
	// 'reset',
	// 'logout',
	// 'home',
];

const transformData = (data: any) => {
	const result: any[] = [];
	data.forEach((item: any) => {
		const newPermission = [
			{
				key: `Add ${item}`,
				value: `add_${item}`,
			},
			{
				key: `View ${item}`,
				value: `view_${item}`,
			},
			{
				key: `Edit ${item}`,
				value: `edit_${item}`,
			},
			{
				key: `Delete ${item}`,
				value: `delete_${item}`,
			},
		];
		result.push(newPermission);
	});
	return result;
};

const permissions = transformData(data);

export default permissions;
