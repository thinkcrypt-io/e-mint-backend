import mongoose from 'mongoose';
import Report from '../../models/tenancy/report.model.js';
import PanelRole from '../../models/tenancy/panelRole.model.js';
import PanelAdmin from '../../models/tenancy/panelAdmin.model.js';
import { listModelFields, scopedModel } from '../../functions/routeRegistry.function.js';
import { isAccessRestricted } from '../../functions/recordAccess.function.js';
import { effectiveSettings, routeModel, routePermission } from '../builder/builder.controller.js';
import { ReportError, reportData } from '../aggregate/getReport.controller.js';
import { grants } from '../../functions/tenantPermissions.function.js';
import { MANAGE_PANEL, USERNAME_HELP, USERNAME_RULE, panelLoginName, panelLoginTaken, publicPanelAdmin } from '../../functions/panelAdmin.function.js';
import { tenantSessions } from '../../functions/sessions.function.js';
import { recordProjectEvent } from '../../functions/recordHistory.function.js';
import { checkReport, modelOf, rangeFrom, reportView } from '../../../routes-tenant/reports.router.js';
import { cleanPanelRoleKeys, panelRoleTargets } from '../../../routes-tenant/panelRoles.router.js';
import { refNaming } from './records.helpers.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * Reports, panel roles and panel users over MCP (docs/panel-users RP-04, PU-05).
 *
 *   list_reports, run_report      anyone who can view the report's model ("data" scope); a panel user also needs reports:view
 *   save_report, delete_report    Build — the project's developers
 *   list_panel_access             panel roles (with what they can name) and panel users
 *   save_panel_role, save_panel_user
 *                                 the project's managers, or a panel super admin from the panel MCP
 *
 * Runs go through the same engine as the panels (getReport.controller.ts reportData), on what the
 * caller may read: the model's view permission, archived rows hidden; models with per-record access refused.
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string): Out => ({ text, isError: true });
const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));
const OPS: Record<string, string> = { gt: '$gt', gte: '$gte', lt: '$lt', lte: '$lte', ne: '$ne', in: '$in', nin: '$nin' };

/** What the report helpers read off a request: whose permissions, and whether it's a panel login. */
const who = (caller: Caller) => ({ permissions: caller.permissions, panelAdmin: caller.panel ? caller.user : null });
const canBuild = (caller: Caller) => !caller.panel && caller.allows('build');
const mayRun = (caller: Caller, permission: string) => caller.allows(`view-${permission}`) && (!caller.panel || caller.allows('reports:view'));
const manages = (caller: Caller) => (caller.panel ? grants(caller.permissions, [MANAGE_PANEL]) : caller.allows('manage-projects') || caller.allows('invite-to-projects'));

const runReport = async (req: any, caller: Caller, report: any, args: any): Promise<Out> => {
	const Model: mongoose.Model<any> | null = routeModel(req.app, report.route);
	const permission = routePermission(req.app, report.route);
	if (!Model || !permission) return refuse(`This report’s model (/${report.route}) is gone.`);
	if (!canBuild(caller) && !mayRun(caller, permission)) return refuse(`${caller.user.name || 'You'} can’t open this report (needs view-${permission}${caller.panel ? ' and reports:view' : ''}).`);
	if (isAccessRestricted(Model)) return refuse(`/${report.route} has per-record access — run this report in the panel instead.`);

	const raw: any = await effectiveSettings(req.app, report.route);
	const list: any[] = Array.isArray(raw?.fields) ? raw.fields : Object.entries(raw || {}).map(([key, v]: any) => ({ key, ...v }));
	const settings: Record<string, any> = Object.fromEntries(list.map(f => [f.key, { title: f.title || f.label || f.key, exclude: !!f.exclude }]));
	const fields = listModelFields(Model).filter(f => !f.key.includes('.') && !settings[f.key]?.exclude && f.key !== '__v');
	const allowed = new Set<string>([...fields.map(f => f.key), 'createdAt', 'updatedAt']);
	for (const f of fields) if (!settings[f.key]) settings[f.key] = { title: f.key };

	const query: any = { archivedAt: null };
	// The reader's picks for the report's reader filters ("is"); its own filters below win.
	const readable = new Set<string>(report.readerFilters || []);
	for (const [key, v] of Object.entries(args?.filters && typeof args.filters === 'object' ? args.filters : {}))
		if (readable.has(key) && allowed.has(key) && v !== '' && v != null) query[key] = v;
	for (const f of report.filters || []) {
		if (!allowed.has(f.field)) continue;
		const v = f.value;
		if (f.op === 'exists') query[f.field] = v === false || v === 'false' ? { $in: [null, ''] } : { $nin: [null, ''] };
		else if (OPS[f.op]) query[f.field] = { [OPS[f.op]]: f.op === 'in' || f.op === 'nin' ? [].concat(typeof v === 'string' ? v.split(',') : v) : v };
		else query[f.field] = v;
	}
	const populate = (
		await Promise.all(
			fields
				.filter(f => (f as any).ref)
				.map(async f => {
					const Ref = scopedModel((f as any).ref);
					return Ref ? { path: f.key, select: (await refNaming((f as any).ref, Ref)).join(' ') || '_id' } : null;
				}),
		)
	).filter(Boolean);

	const tz = typeof args?.tz === 'string' ? args.tz : 'UTC';
	let out;
	try {
		out = await reportData(Model, { query, settings, allowed, populate }, {
			...report,
			from: args?.from || (args?.to ? undefined : rangeFrom(report.range, tz)),
			to: args?.to || undefined,
			tz,
			limit: Math.min(Math.max(parseInt(args?.limit, 10) || 200, 1), 500),
		});
	} catch (e: any) {
		if (e instanceof ReportError) return refuse(e.message);
		throw e;
	}
	const cell = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? '');
	const head = out.columns.map(c => c.label).join(' | ');
	const lines = out.rows.map(r => r.map(cell).join(' | '));
	const foot = out.footer ? `\n${out.footer.map(cell).join(' | ')}` : '';
	const link = caller.link(`/reports/${report._id}`);
	return {
		text: `“${report.name}” — ${out.count} row(s)${out.truncated ? ' (more than shown: narrow the dates or open it in the panel)' : ''}${out.from || out.to ? `, ${args?.from || '…'} to ${args?.to || '…'}` : ''}.\n${head}\n${lines.join('\n')}${foot}\n\nOpen or download it: ${link}`,
		data: { report: { _id: String(report._id), name: report.name }, columns: out.columns, rows: out.rows, footer: out.footer, truncated: out.truncated, link },
	};
};

const REPORT_PROPS = {
	name: { type: 'string' },
	description: { type: 'string' },
	category: { type: 'string', description: 'A heading the reports page groups it under, e.g. "Milk"' },
	route: { type: 'string', description: 'The model’s route (list_models)' },
	type: { type: 'string', enum: ['list', 'summary', 'timeline'], description: 'list: records as rows; summary: one row per value of groupBy; timeline: one row per day/week/month/year of dateField' },
	columns: { type: 'array', items: { type: 'object', required: ['key'], properties: { key: { type: 'string', description: 'A field, or a linked record’s part ("animal.tagId")' }, label: { type: 'string' } } } },
	sort: { type: 'string', description: 'list: e.g. "-date"' },
	totals: { type: 'array', items: { type: 'string' }, description: 'list: number columns summed in a Total row' },
	groupBy: { type: 'string', description: 'summary: the field each row is (a link or a choice field)' },
	interval: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
	sums: { type: 'array', items: { type: 'object', required: ['field'], properties: { field: { type: 'string' }, label: { type: 'string' } } }, description: 'summary/timeline: number fields summed per row' },
	filters: {
		type: 'array',
		items: { type: 'object', required: ['field'], properties: { field: { type: 'string' }, op: { type: 'string', enum: ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'exists'] }, value: {} } },
		description: 'Always applied — e.g. only status "sold"',
	},
	readerFilters: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Fields whoever runs the report can narrow it by (one value each) — e.g. employee, department' },
	dateField: { type: 'string', description: 'The date the reader’s From/To and a timeline use (default createdAt)' },
	range: { type: 'string', enum: ['all', 'today', '7d', '30d', '90d', 'month', 'year'], description: 'The dates it opens with' },
	exportable: { type: 'boolean', description: 'Whether it can be downloaded' },
	formats: { type: 'array', items: { type: 'string', enum: ['csv', 'xlsx', 'pdf'] } },
};

export const REPORT_INSTRUCTIONS = `
Reports: list_reports shows the project's saved reports, run_report runs one (rows, totals, dates). With Build, save_report makes or changes one — a list of records with chosen columns and totals, a summary grouped by a field, or a timeline per day/week/month — and whether it can be downloaded (CSV, Excel, PDF). Read the model with get_model first, show the user the report you'll save and wait for their go-ahead.
Panel users (logins of the panel app, panel.tcrypt.site): list_panel_access shows the panel roles and users; save_panel_role sets what a role may do per model (view/create/edit/delete) plus reports:view and reports:export; save_panel_user adds or changes a login (a role, or superAdmin). Panel users never build. Confirm each with the user first; never invent a password — ask the user for it.`;

export const REPORT_TOOLS: ToolDef[] = [
	{
		name: 'list_reports',
		title: 'List reports',
		description: 'The project’s saved reports the key’s owner can run: name, model, kind, columns, filters, whether downloadable, and id.',
		scope: 'data',
		only: 'project',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (req, _args, caller) => {
			const reports: any[] = await Report.find({}).sort({ order: 1, category: 1, name: 1 }).lean();
			const build = canBuild(caller);
			const shown = reports.filter(r => {
				const permission = routePermission(req.app, r.route);
				return build || (permission && mayRun(caller, permission));
			});
			if (!shown.length) return { text: build ? 'No reports yet — save_report makes one.' : 'No reports you can open.', data: { reports: [] } };
			const views = shown.map(r => reportView(r, who(caller)));
			const lines = views.map(
				r =>
					`- “${r.name}”${r.category ? ` [${r.category}]` : ''} — ${r.type} on /${r.route}${r.type === 'summary' ? ` by ${r.groupBy}` : r.type === 'timeline' ? ` per ${r.interval} of ${r.dateField}` : `: ${r.columns.map((c: any) => c.key).join(', ')}`}${r.filters.length ? `; filters ${r.filters.map((f: any) => `${f.field} ${f.op} ${JSON.stringify(f.value)}`).join(', ')}` : ''}${r.exportable ? ` · downloads ${r.formats.join('/')}` : ' · not downloadable'} [id ${r._id}]`
			);
			return { text: `${views.length} report(s):\n${lines.join('\n')}`, data: { reports: views } };
		},
	},
	{
		name: 'run_report',
		title: 'Run a report',
		description: 'Runs a saved report (list_reports) on the records the key’s owner may read and returns its rows and totals, with a link to open or download it in the panel. `from` / `to` (YYYY-MM-DD) narrow its date field; without them it uses its default range.',
		scope: 'data',
		only: 'project',
		inputSchema: {
			type: 'object',
			required: ['id'],
			properties: { id: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, filters: { type: 'object', description: 'A value for each of the report’s readerFilters, e.g. { employee: "<id>" }' }, limit: { type: 'integer', description: 'Rows to return (1–500, default 200)' }, tz: { type: 'string', description: 'IANA time zone, e.g. Asia/Dhaka' } },
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (req, args, caller) => {
			if (!isId(args?.id)) return refuse('Give the report’s id (list_reports).');
			const report: any = await Report.findById(args.id).lean();
			if (!report) return refuse('No report with that id — call list_reports.');
			return runReport(req, caller, report, args);
		},
	},
	{
		name: 'save_report',
		title: 'Save a report',
		description: 'Makes a report (no `id`) or replaces one (`id`, send it whole — read it with list_reports first). Checked like the panel’s report builder; `preview: true` runs it without saving. Needs Build.',
		scope: 'build',
		only: 'project',
		inputSchema: { type: 'object', required: ['name', 'route'], properties: { id: { type: 'string' }, preview: { type: 'boolean' }, ...REPORT_PROPS } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: async (req, args, caller) => {
			if (!canBuild(caller)) return refuse('Only developers (Build) make reports.');
			let body: any;
			try {
				const { id, preview, ...rest } = args || {};
				body = checkReport(rest);
			} catch (e: any) {
				return refuse(e.message);
			}
			const def: any = await modelOf(body.route);
			if (!def) return refuse(`No model at /${body.route} — call list_models.`);
			body.route = def.route;
			if (args?.preview) {
				const out = await runReport(req, caller, { ...body, _id: 'preview' }, { limit: 20 });
				return out.isError ? out : { ...out, text: `Preview (not saved):\n${out.text.replace(/\n\nOpen or download it:.*$/s, '')}` };
			}
			let report: any;
			if (args?.id) {
				if (!isId(args.id)) return refuse('That id isn’t a report’s.');
				report = await Report.findById(args.id);
				if (!report) return refuse('No report with that id — call list_reports.');
				report.set({ ...body, updatedBy: caller.user._id });
				await report.save();
			} else report = await Report.create({ ...body, createdBy: caller.user._id, updatedBy: caller.user._id });
			recordProjectEvent({ req: { ...req, user: caller.user, project: caller.project }, model: 'Report', modelPath: 'saved-reports', document: report._id, name: report.name, text: `${args?.id ? 'changed' : 'added'} the report ${report.name} (via AI)` });
			return { text: `Saved “${report.name}” [id ${report._id}]. ${caller.link(`/reports/${report._id}`)}`, data: { report: reportView(report, who(caller), def) } };
		},
	},
	{
		name: 'delete_report',
		title: 'Delete a report',
		description: 'Deletes a saved report. Only after the user confirms. Needs Build.',
		scope: 'build',
		only: 'project',
		inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		run: async (req, args, caller) => {
			if (!canBuild(caller)) return refuse('Only developers (Build) delete reports.');
			if (!isId(args?.id)) return refuse('Give the report’s id.');
			const report: any = await Report.findById(args.id);
			if (!report) return refuse('No report with that id.');
			await report.deleteOne();
			return { text: `Deleted “${report.name}”.` };
		},
	},
	{
		name: 'list_panel_access',
		title: 'List panel roles and users',
		description: 'The project’s panel roles (what each may do, how many logins hold it) and panel users (role, super admin, on/off), plus what a role can name: each model’s actions and the report keys.',
		scope: 'read',
		only: 'project',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (_req, _args, caller) => {
			if (!manages(caller)) return refuse(caller.panel ? 'Only a super admin manages panel users.' : 'Managing panel users needs Manage projects or Invite to projects.');
			const [roles, users, targets] = await Promise.all([PanelRole.find({}).sort({ name: 1 }).lean(), PanelAdmin.find({ project: caller.project._id }).sort({ createdAt: 1 }).lean(), panelRoleTargets(caller.project?.type)]);
			const names = new Map(roles.map((r: any) => [String(r._id), r.name]));
			const text = [
				`Panel roles (${roles.length}):`,
				...roles.map((r: any) => `- “${r.name}”: ${(r.permissions || []).join(', ')} [id ${r._id}]`),
				`Panel users (${users.length}):`,
				...users.map((u: any) => `- ${u.name} (${panelLoginName(u)}) — ${u.superAdmin ? 'Super admin' : names.get(String(u.role)) || (caller.project.type === 'ecommerce' ? 'Store admin' : 'no role')}${u.isActive === false ? ' (switched off)' : ''} [id ${u._id}]`),
				`A role can name: ${targets.map(t => `${t.route} (${t.actions.join('/')})`).join('; ')}; and reports:view, reports:export.`,
			].join('\n');
			return { text, data: { roles, users: users.map(publicPanelAdmin), targets } };
		},
	},
	{
		name: 'save_panel_role',
		title: 'Save a panel role',
		description: 'Makes (no `id`) or replaces (`id`) a panel role: `permissions` are view-/create-/edit-/delete-/publish-<route> keys (list_panel_access shows them) plus reports:view and reports:export. Adding, editing or deleting includes viewing. Confirm with the user first.',
		scope: 'read',
		only: 'project',
		inputSchema: { type: 'object', required: ['name', 'permissions'], properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } } } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: async (req, args, caller) => {
			if (!manages(caller)) return refuse('Not allowed to manage panel roles.');
			const name = String(args?.name || '').trim().slice(0, 60);
			if (!name) return refuse('Give the role a name.');
			let permissions: string[];
			try {
				permissions = await cleanPanelRoleKeys(Array.isArray(args?.permissions) ? args.permissions : [], caller.project?.type);
			} catch (e: any) {
				return refuse(e.message);
			}
			const rx = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
			if (await PanelRole.exists({ name: rx, ...(isId(args?.id) && { _id: { $ne: args.id } }) })) return refuse('There’s a panel role with that name already.');
			let role: any;
			if (args?.id) {
				role = isId(args.id) && (await PanelRole.findById(args.id));
				if (!role) return refuse('No panel role with that id.');
				role.set({ name, description: args.description ?? role.description, permissions });
				await role.save();
			} else role = await PanelRole.create({ name, description: args?.description || '', permissions, createdBy: caller.user._id });
			return { text: `Saved the panel role “${role.name}”: ${role.permissions.join(', ')} [id ${role._id}]`, data: { role } };
		},
	},
	{
		name: 'save_panel_user',
		title: 'Save a panel user',
		description: 'Adds a panel login (no `id`: name, username, optional email, password from the user, and a `role` id or superAdmin) or changes one (`id`: name, username, email, role, superAdmin, isActive, password). They sign in at the panel app with the username (or the email). Switching off or a new password signs them out. Confirm with the user first; never make up a password.',
		scope: 'read',
		only: 'project',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				name: { type: 'string' },
				username: { type: 'string', description: 'What they sign in with: 3+ of a–z, 0–9, . _ - @ +' },
				email: { type: 'string', description: 'Optional; it signs in too' },
				password: { type: 'string', description: 'At least 8 characters — the user gives it' },
				phone: { type: 'string' },
				role: { type: 'string', description: 'A panel role id (list_panel_access)' },
				superAdmin: { type: 'boolean' },
				isActive: { type: 'boolean' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: async (req, args, caller) => {
			if (!manages(caller)) return refuse('Not allowed to manage panel users.');
			const project = caller.project;
			if (args?.role && !(isId(args.role) && (await PanelRole.exists({ _id: args.role })))) return refuse('That role isn’t one of the project’s panel roles.');
			if (args?.password !== undefined && String(args.password).length < 8) return refuse('Use at least 8 characters for the password.');
			if (!args?.id) {
				const email = String(args?.email || '').trim().toLowerCase();
				const username = String(args?.username || '').trim().toLowerCase();
				if (!args?.name || !username || !args?.password) return refuse('A new login needs a name, a username and a password.');
				if (!USERNAME_RULE.test(username)) return refuse(USERNAME_HELP);
				if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return refuse('That isn’t an email address.');
				if (project.type !== 'ecommerce' && !args.role && !args.superAdmin) return refuse('Give them a role, or make them a super admin.');
				const taken = await panelLoginTaken({ username, email: email || undefined });
				if (taken) return refuse(taken.message);
				const admin: any = await PanelAdmin.create({ name: String(args.name).slice(0, 120), username, ...(email && { email }), password: args.password, phone: args.phone || '', role: args.role || undefined, superAdmin: !!args.superAdmin, organization: project.organization, project: project._id, createdBy: caller.user._id });
				return { text: `Added ${admin.name} (${panelLoginName(admin)}) — they sign in at the panel app.`, data: { user: publicPanelAdmin(admin) } };
			}
			const admin: any = isId(args.id) && (await PanelAdmin.findOne({ _id: args.id, project: project._id }).select('+password'));
			if (!admin) return refuse('No panel user with that id.');
			if (caller.panel && String(caller.user._id) === String(admin._id) && (args.isActive === false || args.superAdmin === false)) return refuse('You can’t switch off or demote your own login.');
			const nextRole = args.role !== undefined ? args.role || undefined : admin.role;
			const nextSuper = args.superAdmin !== undefined ? !!args.superAdmin : !!admin.superAdmin;
			if (project.type !== 'ecommerce' && !nextRole && !nextSuper) return refuse('Give them a role, or make them a super admin.');
			const signOut = (args.isActive === false && admin.isActive !== false) || !!args.password;
			if (args.name) admin.name = String(args.name).slice(0, 120);
			if (args.phone !== undefined) admin.phone = args.phone;
			const changed: any = {};
			if (args.username !== undefined && String(args.username).trim().toLowerCase() !== admin.username) changed.username = String(args.username).trim().toLowerCase();
			if (args.email !== undefined && String(args.email).trim().toLowerCase() !== (admin.email || '')) changed.email = String(args.email).trim().toLowerCase();
			if (changed.username !== undefined && !USERNAME_RULE.test(changed.username)) return refuse(USERNAME_HELP);
			if (changed.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changed.email)) return refuse('That isn’t an email address.');
			const taken = await panelLoginTaken(changed, admin._id);
			if (taken) return refuse(taken.message);
			if (changed.username) admin.username = changed.username;
			if (changed.email !== undefined) admin.email = changed.email || undefined;
			if (!admin.username && !admin.email) return refuse('Give them a username to sign in with.');
			admin.role = nextRole;
			admin.superAdmin = nextSuper;
			if (args.isActive !== undefined) admin.isActive = !!args.isActive;
			if (args.password) admin.password = args.password;
			await admin.save();
			if (signOut) {
				const rows = await tenantSessions.Session.find({ admin: admin._id, revokedAt: null }).lean();
				if (rows.length) await tenantSessions.revokeSessions(rows, admin._id, args.password ? 'Password changed' : 'Login switched off');
			}
			return { text: `Saved ${admin.name} (${panelLoginName(admin)}).`, data: { user: publicPanelAdmin(admin) } };
		},
	},
];
