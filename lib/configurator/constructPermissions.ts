type Permission = {
	create: string;
	read: string;
	view: string;
	edit: string;
	update: string;
	delete: string;
};

const constructPermissions = (id: string): Permission => {
	return {
		create: `add_${id}`,
		read: `view_${id}`,
		view: `view_${id}`,
		edit: `edit_${id}`,
		update: `edit_${id}`,
		delete: `delete_${id}`,
	};
};

export default constructPermissions;
