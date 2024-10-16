type Permission = {
	key: string;
	value: string;
};

const generatePermissionOptions = (data: string[]) => {
	const result: any[] = [];
	data.forEach((item: string) => {
		const newPermission: Permission[] = [
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

export default generatePermissionOptions;
