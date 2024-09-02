export const data: any = [
	'product',
	'category',
	'brand',
	'order',
	'user',
	'role',
	'customer',
	'collection',
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
