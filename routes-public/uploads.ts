import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import File from '../library/models/admin-file/model.js';
import Organization from '../library/models/tenancy/organization.model.js';
import ApiEndpoint from '../library/models/tenancy/apiEndpoint.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { ensureEndpoints } from '../library/functions/apiEndpoints.function.js';
import { runInScope } from '../library/functions/tenantScope.function.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import { projectByKey } from '../library/functions/projectKey.function.js';
import { getS3, resolveUploadFolder } from '../routes-admin/file/media.helpers.js';

/**
 * POST /public/api/uploads?apiKey=<mint_pk_…> — files a visitor attaches to a
 * site's form (docs/api-builder AB-13): multipart, field `files`, up to
 * MAX_FILES of MAX_MB each → `{ files: [{ url, name, type, size }] }`. The
 * site then sends those URLs in the record's files/image field through the
 * form's create endpoint.
 *
 * Only for a project with a form that takes files: an enabled create endpoint
 * anyone may call, on a model with a file, files, image or images field —
 * otherwise 403 `uploads_closed`, so a project key alone never turns MINT into
 * free file hosting. Documents and photos only (never svg or html, which a
 * browser would run from the bucket); rate-limited per IP. Files land in the
 * project's media library, folder "website-uploads" (the organization's
 * shared library when the project uses it, as upload_media does).
 */
const router = express.Router();

const MAX_FILES = 5;
const MAX_MB = 10;
const FILE_KINDS = ['file', 'files', 'image', 'images'];

// What may come in: type → extension. Photos keep their format (no re-encoding
// of what a client sent us); documents are stored as they are.
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
const BY_EXTENSION: Record<string, string> = Object.fromEntries(
	Object.entries(ALLOWED).map(([type, ext]) => [ext, type])
);
BY_EXTENSION.jpeg = 'image/jpeg';

/** The file's type: what the browser said, or its extension when it said something generic. */
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

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_MB * 1024 * 1024, files: MAX_FILES },
});

const limit = rateLimit({ name: 'public-uploads', windowMs: 15 * 60 * 1000, max: 20 });

const fail = (res: any, status: number, code: string, message: string) => res.status(status).json({ code, message });

/** The project its key names, in its scope — as the public API resolves it (routes-public/public.router.ts). */
router.use(async (req: any, res: any, next: any) => {
	try {
		if (req.method === 'OPTIONS') return res.sendStatus(204);
		const q = req.query?.apiKey;
		const key = String((Array.isArray(q) ? q[0] : q) || req.headers['x-api-key'] || '').trim();
		if (!key) return fail(res, 401, 'api_key_missing', 'The apiKey is missing — add ?apiKey=<your project key>.');
		const project: any = await projectByKey(key);
		if (!project) return fail(res, 401, 'api_key_invalid', 'That apiKey isn’t valid — copy the project key from API → Keys.');
		if (project.isActive === false) return fail(res, 404, 'not_found', 'Not found');
		const org: any = await Organization.findById(project.organization, { isActive: 1 }).lean();
		if (!org || org.isActive === false) return fail(res, 404, 'not_found', 'Not found');
		req.project = project;
		runInScope({ organization: project.organization, project: project._id }, () => next());
	} catch (e) {
		next(e);
	}
});

/** True when one of the project's open create endpoints writes to a model that has a file or image field. */
const takesFiles = async () => {
	// A model's standard endpoints are made on the public API's first call — make them here too
	await ensureEndpoints();
	const open: any[] = await ApiEndpoint.find({ action: 'create', enabled: true, 'access.who': 'anyone' }, { model: 1 }).lean();
	if (!open.length) return false;
	const defs: any[] = await ModelDefinition.find({ route: { $in: open.map(e => e.model) } }, { fields: 1 }).lean();
	return defs.some(d => (d.fields || []).some((f: any) => FILE_KINDS.includes(f.kind)));
};

router.post('/', limit, async (req: any, res: any) => {
	if (!process.env.S3_BUCKET_NAME) return fail(res, 503, 'uploads_unavailable', 'File storage isn’t set up on this server.');
	const project = req.project;
	const scope = { organization: project.organization, project: project._id };
	if (!(await runInScope(scope, takesFiles)))
		return fail(res, 403, 'uploads_closed', 'This project has no form that takes files — add a file field to a model with a public create endpoint.');

	upload.array('files', MAX_FILES)(req, res, async (err: any) => {
		if (err) {
			const message =
				err.code === 'LIMIT_FILE_SIZE'
					? `Files up to ${MAX_MB} MB each.`
					: err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
						? `Up to ${MAX_FILES} files, sent as \`files\`.`
						: 'The upload couldn’t be read.';
			return fail(res, 400, 'upload_invalid', message);
		}
		const files: Express.Multer.File[] = req.files || [];
		if (!files.length) return fail(res, 400, 'upload_empty', 'Send the files as multipart form data, field `files`.');
		const bad = files.find(f => !typeOf(f) || !f.size);
		if (bad)
			return fail(res, 415, 'upload_type', `“${bad.originalname}” can’t be attached — photos, PDF, Word, Excel, PowerPoint, text, CSV or zip only.`);

		// multer calls back from the request's stream events, so the scope is named again, not inherited
		const save = async () => {
			const folder = await resolveUploadFolder('website-uploads');
			const out = [];
			for (const f of files) {
				const type = typeOf(f);
				const ext = ALLOWED[type];
				const key = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${keyName(f.originalname, ext)}`;
				const uploaded: any = await getS3()
					.upload({
						Bucket: process.env.S3_BUCKET_NAME!,
						Body: f.buffer,
						Key: key,
						ContentType: type,
						// Documents download with their own name instead of opening from the bucket
						...(!type.startsWith('image/') && { ContentDisposition: `attachment; filename="${keyName(f.originalname, ext)}"` }),
					})
					.promise();
				const name = String(f.originalname || key).slice(0, 200);
				await File.create({
					name,
					description: 'Attached to a website form',
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
		try {
			const saved = await runInScope(project.mediaScope === 'organization' ? { organization: project.organization } : scope, save);
			return res.status(201).json({ files: saved });
		} catch (e: any) {
			console.error('public uploads:', e?.message);
			return fail(res, 500, 'upload_failed', 'The upload failed — try again.');
		}
	});
});

export default router;
