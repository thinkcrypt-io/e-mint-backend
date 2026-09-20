const fields = [
	'text',
	'action',
	'model',
	'userName',
	'user',
	'documentName',
	'documentCode',
	'modelPath',
	'document',
	'changes',
	'createdAt',
];

const tableFields = ['text', 'action', 'model', 'userName', 'createdAt'];

// No form: entries are written by the server when something happens, never by
// hand, so there is no create/edit layout to define.
const formFields: any[] = [];

const route = {
	title: 'History',
	subTitle: 'Every create, edit and delete across the admin',
	path: 'history',
	// No create button and no edit/delete menu — an audit trail you can edit is
	// not an audit trail. `view-server-modal` is kept so a row can be inspected
	// in full, including its field-level changes.
	export: true,
	menu: [{ type: 'view-server-modal', title: 'View Entry' }],
};

const config = {
	fields,
	table: tableFields,
	form: formFields,
	route,
};

export default config;
