import { SettingsType } from '../../lib/types/settings.types.js';
import Admin from '../../library/models/admin/model.js';
import Client from '../client/client.model.js';
import Software from '../software/software.model.js';

const settings: SettingsType<any> = {
	apiToken: {
		title: 'API Token',
		type: 'string',
		required: true,
		edit: false,
		exclude: true,
		schema: {
			type: 'password',
			// `edit: false` above means the generic PUT rejects this field outright
			// ("Invalid fields: 'apiToken' not allowed"), so an editable box here
			// could only ever produce a 400. Rotation goes through PUT /:id/key.
			// `createType` applies this on update only, so create stays editable.
			readOnlyOnUpdate: true,
		},
	},
	code: {
		title: 'Code',
		type: 'string',
		edit: true,
		schema: {
			sort: true,
			default: true,
		},
	},
	label: {
		title: 'Label',
		type: 'string',
		required: true,
		edit: true,
		search: true,
		trim: true,
		min: 2,
		max: 60,
	},
	tokenLast4: {
		title: 'Token',
		type: 'string',
		edit: false,
	},
	userEmail: {
		title: 'Vercel Email',
		type: 'email',
		edit: false,
		search: true,
	},
	username: {
		title: 'Username',
		type: 'string',
		edit: false,
		search: true,
	},
	displayName: {
		title: 'Account Name',
		type: 'string',
		edit: false,
	},
	userId: {
		title: 'Vercel ID',
		type: 'string',
		edit: false,
	},
	plan: {
		title: 'Plan',
		type: 'string',
		edit: false,
		filter: {
			name: 'plan',
			field: 'plan_in',
			type: 'multi-select',
			label: 'Plan',
			title: 'Filter by Plan',
			options: [
				{ label: 'Hobby', value: 'hobby' },
				{ label: 'Pro', value: 'pro' },
				{ label: 'Enterprise', value: 'enterprise' },
				{ label: 'Unknown', value: 'unknown' },
			],
		},
		schema: {
			type: 'select',
			options: [
				{ label: 'Hobby', value: 'hobby' },
				{ label: 'Pro', value: 'pro' },
				{ label: 'Enterprise', value: 'enterprise' },
				{ label: 'Unknown', value: 'unknown' },
			],
		},
	},
	defaultTeamId: {
		title: 'Default Team',
		type: 'string',
		edit: false,
	},
	status: {
		title: 'Status',
		type: 'string',
		edit: false,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{ label: 'Active', value: 'active' },
				{ label: 'Invalid', value: 'invalid' },
				{ label: 'Unverified', value: 'unverified' },
			],
		},
		schema: {
			type: 'select',
			options: [
				{ label: 'Active', value: 'active' },
				{ label: 'Invalid', value: 'invalid' },
				{ label: 'Unverified', value: 'unverified' },
			],
		},
	},
	projectCount: {
		title: 'Projects',
		type: 'number',
		edit: false,
	},
	lastSyncedAt: {
		title: 'Last Synced',
		type: 'date',
		edit: false,
		schema: {
			type: 'date',
			tableType: 'date-only',
		},
	},
	lastError: {
		title: 'Last Error',
		type: 'string',
		edit: false,
	},
	client: {
		title: 'Client',
		type: 'string',
		sort: true,
		edit: true,
		populate: {
			path: 'client',
			select: 'name',
		},
		filter: {
			name: 'client',
			field: 'client_in',
			type: 'multi-select',
			category: 'model',
			model: Client,
			key: 'name',
			label: 'Client',
			title: 'Filter by Client',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'client.name',
			model: 'clients',
		},
	},
	project: {
		title: 'Project',
		type: 'string',
		sort: true,
		edit: true,
		populate: {
			path: 'project',
			select: 'name',
		},
		filter: {
			name: 'project',
			field: 'project_in',
			type: 'multi-select',
			category: 'model',
			model: Software,
			key: 'name',
			label: 'Project',
			title: 'Filter by Project',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'project.name',
			model: 'projects',
		},
	},
	note: {
		title: 'Note',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			type: 'editor',
		},
	},
	privacy: {
		title: 'Privacy',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		filter: {
			name: 'privacy',
			field: 'privacy_in',
			type: 'multi-select',
			label: 'Privacy',
			title: 'Filter by Privacy',
			options: [
				{ label: 'Public', value: 'public' },
				{ label: 'Private', value: 'private' },
				{ label: 'Only Me', value: 'only-me' },
			],
		},
		schema: {
			type: 'select',
			options: [
				{ label: 'Public', value: 'public' },
				{ label: 'Private', value: 'private' },
				{ label: 'Only Me', value: 'only-me' },
			],
		},
	},
	addedBy: {
		title: 'Added by',
		type: 'string',
		sort: true,
		edit: true,
		populate: {
			path: 'addedBy',
			select: 'name',
		},
		filter: {
			name: 'addedBy',
			field: 'addedBy_in',
			type: 'multi-select',
			category: 'model',
			model: Admin,
			key: 'name',
			label: 'Added by',
			title: 'Filter by Added by',
		},
		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'addedBy.name',
			model: 'admins',
		},
	},
	access: {
		title: 'Access',
		type: 'array',
		edit: true,
		schema: {
			type: 'data-tag',
			viewType: 'data-array-tag',
			model: 'admins',
			modelAddOn: 'email',
			tooltip: 'Users who can access this document',
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		edit: true,
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Created at',
			title: 'Filter by Created at',
		},
		schema: {
			type: 'date',
			tableType: 'date-only',
		},
	},
	updatedAt: {
		title: 'Updated at',
		type: 'date',
		edit: true,
		schema: {
			type: 'date',
			tableType: 'date-only',
		},
	},
};

export default settings;
