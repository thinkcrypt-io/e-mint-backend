import mongoose, { Schema } from 'mongoose';

export type AdminRoleType = {
	name: string;
	description?: string;
	logo?: string;
	permissions: string[];
	isActive: boolean;
	image?: string;
	createdAt?: Date;
};

const schema = new Schema<AdminRoleType>(
	{
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
			uppercase: true,
		},
		description: {
			type: String,
			trim: true,
		},
		logo: {
			type: String,
			trim: true,
		},

		permissions: {
			type: [String],
			default: [],
		},

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		image: {
			type: String,
			trim: true,
		},
	},

	{
		timestamps: true,
	}
);

//
import { SettingsType } from '../../imports.js';
import { generatePermissionOptions } from '../../lib/index.js';

const permissions = generatePermissionOptions([
	'user',
	'shop',
	'admin',
	'role',
	'membership',
	'setting',
	'report',
]);

export const adminRoleSettings: SettingsType<AdminRoleType> = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Role Name',
		type: 'string',
		min: 3,
		max: 50,
		required: true,
		trim: true,
		unique: true,
		schema: {
			displayInTable: true,
			default: true,
			isRequired: true,
		},
	},
	description: {
		edit: true,
		type: 'string',
		title: 'Role Description',
		trim: true,
	},

	permissions: {
		edit: true,
		title: 'Permissions',
		type: 'array',
		filter: {
			name: 'permissions',
			type: 'multi-select',
			label: 'Permissions',
			title: 'Filter by permissions',
			options: permissions,
		},
	},

	isActive: {
		edit: true,
		type: 'boolean',
		title: 'Active Status',
		sort: true,
		schema: {
			displayInTable: true,
			default: true,
		},

		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by active status',
		},
	},

	image: {
		edit: true,
		title: 'Image',
		type: 'uri',
	},
	createdAt: {
		type: 'string',
		title: 'Created At',
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Created At',
			title: 'Sort by created at',
		},
	},
};

const AdminRole = mongoose.model<AdminRoleType>('AdminRole', schema);
export default AdminRole;
