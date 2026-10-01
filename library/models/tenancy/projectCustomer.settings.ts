import { SettingsType } from '../../types/_index.js';

/**
 * The tenant panel's Customers table over a project's ProjectCustomer
 * documents (routes-tenant/project.router.ts). Customers sign up themselves
 * (public API / widget); the tenant can rename, switch off or delete them —
 * never see or set a password.
 */
const settings: SettingsType<any> = {
	name: { title: 'Name', type: 'string', search: true, edit: true, required: true, trim: true, schema: { default: true, sort: true } },
	email: { title: 'Email', type: 'string', search: true, edit: false, schema: { type: 'email', default: true, sort: true } },
	phone: { title: 'Phone', type: 'string', search: true, edit: true, trim: true, schema: { default: true } },
	isActive: {
		title: 'Active',
		type: 'boolean',
		edit: true,
		filter: { name: 'isActive', type: 'boolean', label: 'Active', title: 'Filter by active' },
		schema: { default: true, sort: true, helperText: 'Switched off customers can’t sign in.' },
	},
	lastLoginAt: { title: 'Last sign-in', type: 'date', sort: true, schema: { type: 'date', default: true, sort: true } },
	createdAt: {
		title: 'Joined',
		type: 'date',
		sort: true,
		filter: { name: 'createdAt', type: 'date', label: 'Joined', title: 'Filter by joined' },
		schema: { type: 'date', default: true, sort: true },
	},
	password: { title: 'Password', type: 'string', exclude: true },
	tokenVersion: { title: 'Token version', type: 'number', exclude: true },
};

export default settings;

export const projectCustomerConfig = {
	fields: ['name', 'email', 'phone', 'isActive', 'lastLoginAt', 'createdAt'],
	table: ['name', 'email', 'phone', 'isActive', 'lastLoginAt', 'createdAt'],
	form: [{ sectionTitle: 'Customer', fields: ['name', 'phone', 'isActive'] }],
	route: {
		title: 'Customers',
		path: 'customers',
		menu: [
			{ type: 'edit-modal', title: 'Edit', layout: [{ sectionTitle: 'Customer', fields: ['name', 'phone', 'isActive'] }] },
			{ type: 'delete', title: 'Delete' },
		],
	},
};
