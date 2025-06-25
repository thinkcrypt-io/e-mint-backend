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
		create: `create-${id}`,
		read: `view-${id}`,
		view: `view-${id}`,
		edit: `edit-${id}`,
		update: `edit-${id}`,
		delete: `delete-${id}`,
	};
};

export default constructPermissions;
