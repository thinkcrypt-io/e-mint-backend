import { SettingsType } from '../../types/_index.js';
import TenantUser from './tenantUser.model.js';
import Organization from './organization.model.js';

/**
 * The super-admin panel's view of the tenant platform (docs/multi-tenancy
 * WO-16): organizations, tenant users and tenant projects as ordinary admin
 * tables. Read, filter, and switch things off (isActive) — nothing here
 * creates tenants or reaches into their data; deleting is left out.
 *
 * Switching off an organization or a user signs them out on their next
 * request (tenantProtect); switching off a project archives it.
 */

const yesNo = (name: string, label: string) => ({
	name,
	type: 'boolean' as const,
	label,
	title: `Filter by ${label.toLowerCase()}`,
});

const created = {
	title: 'Created',
	type: 'date' as const,
	sort: true,
	filter: { name: 'createdAt', type: 'date' as const, label: 'Created', title: 'Filter by created' },
	schema: { type: 'date', tableType: 'date-only', default: true, sort: true },
};

const OPTIONS = (values: string[]) => values.map(value => ({ value, label: value }));

/* --------------------------------------------------------- organizations */

export const organizationSettings: SettingsType<any> = {
	name: { title: 'Name', type: 'string', search: true, edit: true, required: true, trim: true, schema: { default: true, sort: true } },
	slug: { title: 'Slug', type: 'string', search: true, schema: { default: true, sort: true } },
	owner: {
		title: 'Owner',
		type: 'string',
		populate: { path: 'owner', select: 'name email' },
		filter: { name: 'owner', field: 'owner_in', type: 'multi-select', category: 'model', model: TenantUser, key: 'name', label: 'Owner', title: 'Filter by owner' },
		schema: { type: 'data-menu', tableType: 'string', tableKey: 'owner.name', model: 'tenant-users', default: true },
	},
	plan: {
		title: 'Plan',
		type: 'string',
		edit: true,
		filter: { name: 'plan', field: 'plan_in', type: 'multi-select', label: 'Plan', title: 'Filter by plan', options: OPTIONS(['free', 'pro', 'business']) },
		schema: { type: 'select', options: OPTIONS(['free', 'pro', 'business']), default: true, sort: true },
	},
	isActive: {
		title: 'Active',
		type: 'boolean',
		edit: true,
		filter: yesNo('isActive', 'Active'),
		schema: { default: true, sort: true, helperText: 'Switched off: its members are signed out and can’t sign in to it.' },
	},
	'onboarding.businessName': { title: 'Business', type: 'string', search: true, schema: {} },
	'onboarding.industry': {
		title: 'Industry',
		type: 'string',
		filter: { name: 'onboarding.industry', field: 'onboarding.industry_in', type: 'multi-select', label: 'Industry', title: 'Filter by industry', options: OPTIONS(['agency', 'ecommerce', 'education', 'finance', 'healthcare', 'hospitality', 'manufacturing', 'media', 'nonprofit', 'real-estate', 'retail', 'software', 'travel', 'other']) },
		schema: { default: true },
	},
	'onboarding.teamSize': { title: 'Team size', type: 'string', schema: {} },
	'onboarding.heardFrom': {
		title: 'Heard from',
		type: 'string',
		filter: { name: 'onboarding.heardFrom', field: 'onboarding.heardFrom_in', type: 'multi-select', label: 'Heard from', title: 'Filter by how they heard', options: OPTIONS(['search', 'social', 'friend', 'youtube', 'blog', 'event', 'ad', 'ai-assistant', 'other']) },
		schema: { default: true },
	},
	'onboarding.heardFromOther': { title: 'Heard from (other)', type: 'string', schema: {} },
	'onboarding.website': { title: 'Website', type: 'string', schema: {} },
	'onboarding.country': { title: 'Country', type: 'string', search: true, schema: {} },
	'onboarding.role': { title: 'Their role', type: 'string', schema: {} },
	'onboarding.goals': { title: 'Building', type: 'array', schema: { type: 'tag' } },
	createdAt: created,
};

const ORG_FIELDS = ['name', 'slug', 'owner', 'plan', 'isActive', 'onboarding.businessName', 'onboarding.industry', 'onboarding.teamSize', 'onboarding.heardFrom', 'onboarding.heardFromOther', 'onboarding.website', 'onboarding.country', 'onboarding.role', 'onboarding.goals', 'createdAt'];

export const organizationConfig = {
	fields: ORG_FIELDS,
	table: ['name', 'owner', 'plan', 'isActive', 'onboarding.industry', 'onboarding.heardFrom', 'createdAt'],
	form: [{ sectionTitle: 'Organization', fields: ['name', ['plan', 'isActive']] }],
	view: [
		{ title: 'Organization', columns: 3, fields: ['name', 'slug', 'owner', 'plan', 'isActive', 'createdAt'] },
		{ title: 'About the business (sign-up answers)', columns: 3, fields: ['onboarding.businessName', 'onboarding.industry', 'onboarding.teamSize', 'onboarding.role', 'onboarding.website', 'onboarding.country', 'onboarding.heardFrom', 'onboarding.heardFromOther', 'onboarding.goals'] },
	],
	viewTabs: [
		{ related: 'tenant-projects', foreignField: 'organization', title: 'Projects', columns: ['name', 'type', 'publicSlug', 'isActive', 'createdAt'], pageSize: 20 },
	],
	route: {
		title: 'Organizations',
		path: 'organizations',
		menu: [
			{ type: 'view-item', title: 'View' },
			{ type: 'edit-modal', title: 'Edit', layout: [{ sectionTitle: 'Organization', fields: ['name', ['plan', 'isActive']] }] },
		],
	},
};

/* ---------------------------------------------------------- tenant users */

export const tenantUserSettings: SettingsType<any> = {
	name: { title: 'Name', type: 'string', search: true, edit: true, required: true, trim: true, schema: { default: true, sort: true } },
	email: { title: 'Email', type: 'string', search: true, schema: { type: 'email', default: true, sort: true } },
	phone: { title: 'Phone', type: 'string', search: true, schema: {} },
	isActive: {
		title: 'Active',
		type: 'boolean',
		edit: true,
		filter: yesNo('isActive', 'Active'),
		schema: { default: true, sort: true, helperText: 'Switched off: signed out everywhere and can’t sign in.' },
	},
	twoFactorEnabled: { title: 'Two-factor', type: 'boolean', filter: yesNo('twoFactorEnabled', 'Two-factor'), schema: { default: true } },
	lastOrganization: {
		title: 'Last organization',
		type: 'string',
		populate: { path: 'lastOrganization', select: 'name' },
		schema: { type: 'data-menu', tableType: 'string', tableKey: 'lastOrganization.name', model: 'organizations', default: true },
	},
	password: { title: 'Password', type: 'string', exclude: true },
	twoFactorBackupCodes: { title: 'Backup codes', type: 'array', exclude: true },
	resetPasswordToken: { title: 'Reset token', type: 'string', exclude: true },
	createdAt: created,
};

export const tenantUserConfig = {
	fields: ['name', 'email', 'phone', 'isActive', 'twoFactorEnabled', 'lastOrganization', 'createdAt'],
	table: ['name', 'email', 'isActive', 'twoFactorEnabled', 'lastOrganization', 'createdAt'],
	form: [{ sectionTitle: 'Tenant user', fields: ['name', 'isActive'] }],
	route: {
		title: 'Tenant users',
		path: 'tenant-users',
		menu: [
			{ type: 'view-modal', title: 'View', fields: ['name', 'email', 'phone', 'isActive', 'twoFactorEnabled', 'lastOrganization', 'createdAt'] },
			{ type: 'edit-modal', title: 'Edit', layout: [{ sectionTitle: 'Tenant user', fields: ['name', 'isActive'] }] },
		],
	},
};

/* ------------------------------------------------------- tenant projects */

export const tenantProjectSettings: SettingsType<any> = {
	name: { title: 'Name', type: 'string', search: true, edit: true, required: true, trim: true, schema: { default: true, sort: true } },
	organization: {
		title: 'Organization',
		type: 'string',
		populate: { path: 'organization', select: 'name' },
		filter: { name: 'organization', field: 'organization_in', type: 'multi-select', category: 'model', model: Organization, key: 'name', label: 'Organization', title: 'Filter by organization' },
		schema: { type: 'data-menu', tableType: 'string', tableKey: 'organization.name', model: 'organizations', default: true },
	},
	type: {
		title: 'Kind',
		type: 'string',
		filter: { name: 'type', field: 'type_in', type: 'multi-select', label: 'Kind', title: 'Filter by kind', options: OPTIONS(['app', 'website']) },
		schema: { type: 'select', options: OPTIONS(['app', 'website']), default: true, sort: true },
	},
	publicSlug: { title: 'Public slug', type: 'string', search: true, schema: { default: true } },
	domains: { title: 'Domains', type: 'array', schema: { type: 'tag' } },
	isActive: {
		title: 'Active',
		type: 'boolean',
		edit: true,
		filter: yesNo('isActive', 'Active'),
		schema: { default: true, sort: true, helperText: 'Switched off: archived — read-only, its public API answers 404.' },
	},
	createdAt: created,
};

export const tenantProjectConfig = {
	fields: ['name', 'organization', 'type', 'publicSlug', 'domains', 'isActive', 'createdAt'],
	table: ['name', 'organization', 'type', 'publicSlug', 'isActive', 'createdAt'],
	form: [{ sectionTitle: 'Project', fields: ['name', 'isActive'] }],
	route: {
		title: 'Tenant projects',
		path: 'tenant-projects',
		menu: [
			{ type: 'view-modal', title: 'View', fields: ['name', 'organization', 'type', 'publicSlug', 'domains', 'isActive', 'createdAt'] },
			{ type: 'edit-modal', title: 'Edit', layout: [{ sectionTitle: 'Project', fields: ['name', 'isActive'] }] },
		],
	},
};
