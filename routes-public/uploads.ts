import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import File from '../library/models/admin-file/model.js';
import Organization from '../library/models/tenancy/organization.model.js';
import ApiEndpoint from '../library/models/tenancy/apiEndpoint.model.js';
import ApiCall from '../library/models/tenancy/apiCall.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import ProjectCustomer, { CUSTOMER_TOKEN_KIND } from '../library/models/tenancy/projectCustomer.model.js';
import { runInScope } from '../library/functions/tenantScope.function.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import { projectByKey } from '../library/functions/projectKey.function.js';
import { fileFieldsOf, matchEndpoint, sendsServerKey, serverKeyOf } from '../library/functions/apiEndpoints.function.js';
import { callRecord } from '../library/functions/apiLogs.function.js';
import { currentAccount, customerRole } from '../library/functions/authMapping.function.js';
import { getS3, resolveUploadFolder } from '../routes-admin/file/media.helpers.js';

/**
 * A project's **upload endpoints** (docs/api-builder AB-14): `POST /public/api/<path>?apiKey=<mint_pk_…>`
 * with multipart `files` — up to MAX_FILES of MAX_MB each — → 201 `{ files: [{ url, name, type, size }] }`.
 * The caller then sends those URLs in the model's file/image field through its create or update endpoint.
 *
 * Mounted in server.ts ahead of the public API: it answers only a POST that matches an enabled endpoint
 * whose action is `upload` (made in API → Endpoints, over MCP, or by Generate), and hands every other call
 * on to routes-public/public.router.ts. Who may call it is the endpoint's: anyone (rate-limited per IP),
 * signed-in customers (their token, and the endpoint's customer roles), or a server key — and a valid
 * server key (`X-Api-Key` / `Authorization: Bearer mint_sk_…`) may always upload, whoever the endpoint is
 * for, without the per-IP limit. Photos and documents only, never svg or html (a browser would run them
 * from the bucket). Files land in the project's media library, folder "website-uploads" (the organization's
 * library when the project shares it); each call is counted and logged like the rest of the API.
 */
const router = express.Router();

const MAX_FILES = 5;
const MAX_MB = 10;

// What may come in: type → extension. Photos keep their format; documents are stored as they are.
const ALLOWED: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic',
	'application/pdf': 'pdf',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'text/plain': 'txt',
	'text/csv': 'csv',
	'application/zip': 'zip',
	'application/x-zip-compressed': 'zip',
};
const BY_EXTENSION: Record<string, string> = Object.fromEntries(Object.entries(ALLOWED).map(([type, ext]) => [ext, type]));
BY_EXTENSION.jpeg = 'image/jpeg';

/** The file's type: what the sender said, or its extension when it said something generic. */
const typeOf = (file: Express.Multer.File) => {
	const said = String(file.mimetype || '').toLowerCase();
	if (ALLOWED[said]) return said;
	const ext = String(file.originalname || '').split('.').pop()?.toLowerCase() || '';
	return BY_EXTENSION[ext] || '';
};

/** A safe name for the bucket key: letters, digits, dashes, and its own extension. */
const keyName = (original: string, ext: string) =>
	(String(original || 'file')
		.replace(/\.[^.]+$/, '')
		.normalize('NFKD')
		.replace(/[^\w-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60) || 'file') + `.${ext}`;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: MAX_FILES } });
const limit = rateLimit({ name: 'public-uploads', windowMs: 15 * 60 * 1000, max: 20 });
const secret = () => process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542';

class Refused extends Error {
	constructor(public status: number, public code: string, message: string) {
		super(message);
	}
}

/** The signed-in customer of this project and their customer role, or null — as the public API reads them. */
const customerOf = async (req: any, project: any) => {
	const header = String(req.headers.authorization || '');
	if (!header.startsWith('Bearer ') || header.slice(7).trim().startsWith('mint_sk_')) return null;
	try {
		const claims: any = jwt.verify(header.slice(7).trim(), secret());
		if (claims?.kind !== CUSTOMER_TOKEN_KIND || claims.project !== String(project._id)) return null;
		const row: any = await ProjectCustomer.findById(claims._id).lean();
		if (!row || row.isActive === false || (row.tokenVersion || 0) !== (claims.v || 0)) return null;
		const now: any = await currentAccount(req.app, project, row);
		if (!now) return null;
		return { ...now, customerRole: await customerRole(req.app, project, now) };
	} catch {
		return null;
	}
};

/** Who's calling, as the endpoint allows — or a refusal. A valid server key may always upload. */
const admit = async (req: any, ep: any, project: any) => {
	const key = await serverKeyOf(req);
	if (key) return { key };
	const sent = String(req.headers['x-api-key'] || '').trim() || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
	if (sendsServerKey(req) && sent.startsWith('mint_sk_')) throw new Refused(401, 'key_invalid', 'That server key isn’t valid — it may have been revoked.');
	const who = ep.access?.who || 'anyone';
	if (who === 'key') throw new Refused(401, 'key_required', 'This endpoint needs a server key.');
	if (who === 'customer') {
		const customer = await customerOf(req, project);
		if (!customer) throw new Refused(401, 'customer_required', 'Sign in first.');
		const roles: string[] = ep.access?.customerRoles || [];
		if (roles.length && !roles.includes(customer.customerRole)) throw new Refused(403, 'customer_role_required', 'Your account can’t use this.');
		return { customer };
	}
	return {};
};

/** Reads the multipart body: the files, or a refusal. */
const readFiles = (req: any, res: any) =>
	new Promise<Express.Multer.File[]>((resolve, reject) =>
		upload.array('files', MAX_FILES)(req, res, (err: any) => {
			if (!err) return resolve(req.files || []);
			reject(
				new Refused(
					400,
					'upload_invalid',
					err.code === 'LIMIT_FILE_SIZE'
						? `Files up to ${MAX_MB} MB each.`
						: err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
							? `Up to ${MAX_FILES} files, sent as \`files\`.`
							: 'The upload couldn’t be read.'
				)
			);
		})
	);

/** The files into S3 and the media library, one File each. */
const store = async (files: Express.Multer.File[]) => {
	const folder = await resolveUploadFolder('website-uploads');
	const out = [];
	for (const f of files) {
		const type = typeOf(f);
		const ext = ALLOWED[type];
		const uploaded: any = await getS3()
			.upload({
				Bucket: process.env.S3_BUCKET_NAME!,
				Body: f.buffer,
				Key: `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${keyName(f.originalname, ext)}`,
				ContentType: type,
				// Documents download with their own name instead of opening from the bucket
				...(!type.startsWith('image/') && { ContentDisposition: `attachment; filename="${keyName(f.originalname, ext)}"` }),
			})
			.promise();
		const name = String(f.originalname || uploaded.Key).slice(0, 200);
		await File.create({
			name,
			description: 'Sent through an upload endpoint',
			url: uploaded.Location,
			key: uploaded.Key,
			type,
			fileType: type.startsWith('image/') ? 'image' : 'document',
			fileFolder: folder._id,
			folder: folder.slug,
			bucket: uploaded.Bucket,
			size: f.size,
		});
		out.push({ url: uploaded.Location, name, type, size: f.size });
	}
	return out;
};

router.use(async (req: any, res: any, next: any) => {
	if (req.method !== 'POST') return next();
	let project: any;
	let ep: any;
	try {
		// The project its key names — a missing or wrong key is the public API's to answer
		const q = req.query?.apiKey;
		project = await projectByKey(String((Array.isArray(q) ? q[0] : q) || req.headers['x-api-key'] || '').trim());
		if (!project || project.isActive === false) return next();
		const scope = { organization: project.organization, project: project._id };
		const endpoints: any[] = await runInScope(scope, () => ApiEndpoint.find({ action: 'upload', enabled: true }).lean());
		ep = matchEndpoint(endpoints, 'POST', req.path)?.ep;
		if (!ep) return next();
	} catch (e) {
		return next(e);
	}

	const scope = { organization: project.organization, project: project._id };
	const started = Date.now();
	req.apiLog = { endpoint: ep };
	const answer = (status: number, body: any) => {
		if (status >= 400) req.apiLog.error = { message: body.message, code: body.code };
		res.status(status).json(body);
	};
	res.on('finish', () => {
		runInScope(scope, () => ApiCall.create(callRecord(req, res, started))).catch(() => undefined);
	});
	runInScope(scope, () =>
		ApiEndpoint.updateOne({ _id: ep._id }, { $inc: { 'stats.calls': 1 }, $set: { 'stats.lastCalledAt': new Date() } })
	).catch(() => undefined);

	try {
		const org: any = await Organization.findById(project.organization, { isActive: 1 }).lean();
		if (!org || org.isActive === false) throw new Refused(404, 'not_found', 'Not found');
		if (!process.env.S3_BUCKET_NAME) throw new Refused(503, 'uploads_unavailable', 'File storage isn’t set up on this server.');
		// multer calls back from the request's stream events, so the scope is named each time, not inherited
		const caller = await runInScope(scope, () => admit(req, ep, project));
		Object.assign(req.apiLog, caller);
		// Anyone and customers are limited per IP; the limiter answers 429 itself when they're over
		if (!caller.key && !(await new Promise<boolean>(resolve => (res.once('finish', () => resolve(false)), limit(req, res, () => resolve(true))))))
			return;
		const def: any = await runInScope(scope, () => ModelDefinition.findOne({ route: ep.model, active: { $ne: false } }).lean());
		if (!def || !fileFieldsOf(def).length) throw new Refused(409, 'uploads_closed', 'This endpoint’s model has no file field any more.');

		const files = await readFiles(req, res);
		if (!files.length) throw new Refused(400, 'upload_empty', 'Send the files as multipart form data, field `files`.');
		const bad = files.find(f => !typeOf(f) || !f.size);
		if (bad) throw new Refused(415, 'upload_type', `“${bad.originalname}” can’t be attached — photos, PDF, Word, Excel, PowerPoint, text, CSV or zip only.`);

		const saved = await runInScope(project.mediaScope === 'organization' ? { organization: project.organization } : scope, () => store(files));
		answer(201, { files: saved });
	} catch (e: any) {
		if (e instanceof Refused) return answer(e.status, { code: e.code, message: e.message });
		console.error('upload endpoint:', e?.message);
		answer(500, { code: 'upload_failed', message: 'The upload failed — try again.' });
	}
});

export default router;
