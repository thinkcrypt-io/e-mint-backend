import fs from 'fs';
import express, { Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import sharp from 'sharp';
import File from '../../library/models/admin-file/model.js';
import Folder from '../../library/models/folders/model.js';
// adminPermissions checks the AdminRole an admin actually references (the plain
// hasPermission middleware reads the older Role collection).
import { adminProtect as protect, adminPermissions as hasPermission } from '../../middleware/index.js';
import {
	getS3,
	deleteS3ObjectIfUnused,
	isObjectId,
	folderSlug,
	siblingFolderExists,
	uniqueFolderName,
	descendantFolderIds,
	folderPath,
} from './media.helpers.js';

// The media manager (admin /images). A Drive-style API over the File + Folder
// models: browse a folder, search everything, rename, bulk move, trash / restore /
// delete forever, copy, usage totals, downloads and any-type uploads.
// Access follows the existing `image` permission family.
const router = express.Router();

const view = [protect, hasPermission(['view-image'])];
const create = [protect, hasPermission(['create-image'])];
const edit = [protect, hasPermission(['edit-image'])];
const remove = [protect, hasPermission(['delete-image'])];

const TRASH_DAYS = 30;
const live = { trashedAt: null };

const upload = multer({ dest: 'from/', limits: { fileSize: 50 * 1024 * 1024 } });

const toIds = (list: any): mongoose.Types.ObjectId[] =>
	(Array.isArray(list) ? list : [])
		.filter(isObjectId)
		.map((id: string) => new mongoose.Types.ObjectId(id));

const folderOrRoot = (value: any) => (isObjectId(value) ? value : null);

const fail = (res: Response, e: any) => {
	console.error(e.message);
	return res.status(500).json({ message: e.message });
};

const FILE_SORTS: Record<string, any> = {
	name: { name: 1 },
	'-name': { name: -1 },
	createdAt: { createdAt: 1 },
	'-createdAt': { createdAt: -1 },
	size: { size: 1 },
	'-size': { size: -1 },
	type: { type: 1, name: 1 },
	'-type': { type: -1, name: 1 },
};

// Folders sort by name except under a date sort — size/type don't apply to them.
const folderSort = (sort: string) =>
	sort.replace('-', '') === 'createdAt' ? FILE_SORTS[sort] : { name: sort === '-name' ? -1 : 1 };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Adds file/subfolder counts to a list of folders — live contents, or for the
// trash view, the contents that went to the trash with them.
const withCounts = async (folders: any[], trashed = false) => {
	const ids = folders.map(f => f._id);
	const state = trashed ? { trashedAt: { $ne: null } } : { trashedAt: null };
	const [files, subs] = await Promise.all([
		File.aggregate([
			{ $match: { fileFolder: { $in: ids }, ...state } },
			{ $group: { _id: '$fileFolder', count: { $sum: 1 } } },
		]),
		Folder.aggregate([
			{ $match: { parent: { $in: ids }, ...state } },
			{ $group: { _id: '$parent', count: { $sum: 1 } } },
		]),
	]);
	const fileMap = new Map(files.map((r: any) => [String(r._id), r.count]));
	const subMap = new Map(subs.map((r: any) => [String(r._id), r.count]));
	return folders.map(f => ({
		...f,
		fileCount: fileMap.get(String(f._id)) || 0,
		folderCount: subMap.get(String(f._id)) || 0,
	}));
};

/* ------------------------------------------------------------------ browse */

// One folder's contents (or root when `folder` is absent/'root'). With `search`,
// matches across every live folder instead and includes each file's location.
router.get('/browse', ...view, async (req: any, res: Response) => {
	try {
		const { folder, search = '', type, sort = 'name', page = 1, limit = 60 } = req.query;
		const parent = folderOrRoot(folder);
		const lim = Math.min(Number(limit) || 60, 1000);
		const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
		const fileSort = FILE_SORTS[sort] || FILE_SORTS.name;
		const term = String(search).trim();

		const fileQuery: any = { ...live };
		const folderQuery: any = { ...live };
		if (term) {
			const rx = { $regex: escapeRegex(term), $options: 'i' };
			fileQuery.name = rx;
			folderQuery.name = rx;
		} else {
			fileQuery.fileFolder = parent;
			folderQuery.parent = parent;
		}
		if (type && ['image', 'video', 'document'].includes(type)) fileQuery.fileType = type;

		const [folders, files, totalFiles, path] = await Promise.all([
			// Folders aren't paginated, and a type filter hides them (they have no type).
			type ? [] : Folder.find(folderQuery).sort(folderSort(sort)).collation({ locale: 'en' }).lean(),
			File.find(fileQuery)
				.sort(fileSort)
				.collation({ locale: 'en', numericOrdering: true })
				.skip(skip)
				.limit(lim)
				.populate(term ? [{ path: 'fileFolder', select: 'name' }] : [])
				.lean(),
			File.countDocuments(fileQuery),
			parent && !term ? folderPath(parent) : [],
		]);

		return res.status(200).json({
			folders: await withCounts(folders as any[]),
			files,
			path,
			page: Number(page) || 1,
			limit: lim,
			totalFiles,
			hasMore: skip + files.length < totalFiles,
		});
	} catch (e: any) {
		return fail(res, e);
	}
});

// Every live folder, flat — the Move dialog builds its tree from this.
router.get('/tree', ...view, async (req: any, res: Response) => {
	try {
		const folders = await Folder.find(live, { name: 1, parent: 1 })
			.sort({ name: 1 })
			.collation({ locale: 'en' })
			.lean();
		return res.status(200).json({ folders });
	} catch (e: any) {
		return fail(res, e);
	}
});

router.get('/path/:id', ...view, async (req: any, res: Response) => {
	try {
		return res.status(200).json({ path: await folderPath(req.params.id) });
	} catch (e: any) {
		return fail(res, e);
	}
});

router.get('/usage', ...view, async (req: any, res: Response) => {
	try {
		const [byType, trash, folders] = await Promise.all([
			File.aggregate([
				{ $match: { trashedAt: null } },
				{ $group: { _id: '$fileType', size: { $sum: '$size' }, count: { $sum: 1 } } },
			]),
			File.aggregate([
				{ $match: { trashedAt: { $ne: null } } },
				{ $group: { _id: null, size: { $sum: '$size' }, count: { $sum: 1 } } },
			]),
			Folder.countDocuments(live),
		]);
		const size = byType.reduce((n: number, r: any) => n + (r.size || 0), 0);
		const count = byType.reduce((n: number, r: any) => n + r.count, 0);
		return res.status(200).json({
			size,
			count,
			folders,
			byType: byType.map((r: any) => ({ type: r._id || 'other', size: r.size || 0, count: r.count })),
			trash: { size: trash[0]?.size || 0, count: trash[0]?.count || 0 },
		});
	} catch (e: any) {
		return fail(res, e);
	}
});

/* ----------------------------------------------------------------- folders */

router.post('/folders', ...create, async (req: any, res: Response) => {
	try {
		const parent = folderOrRoot(req.body?.parent);
		if (parent && !(await Folder.exists({ _id: parent, ...live }))) {
			return res.status(404).json({ message: 'Parent folder not found' });
		}
		const _id = new mongoose.Types.ObjectId();
		const name = await uniqueFolderName(String(req.body?.name || ''), parent);
		const doc = await Folder.create({ _id, name, parent, slug: folderSlug(name, _id) });
		return res.status(201).json({ message: 'Folder created', doc });
	} catch (e: any) {
		return fail(res, e);
	}
});

// Folder upload: makes sure `segments` (e.g. ['Trip', 'Day 1']) exist under
// `parent`, reusing live folders with the same name, and returns the last one.
router.post('/folders/ensure-path', ...create, async (req: any, res: Response) => {
	try {
		let parent = folderOrRoot(req.body?.parent);
		const segments: string[] = (Array.isArray(req.body?.segments) ? req.body.segments : [])
			.map((s: any) => String(s).trim())
			.filter(Boolean)
			.slice(0, 20);
		for (const name of segments) {
			const existing: any = await Folder.findOne({
				parent,
				...live,
				name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
			}).lean();
			if (existing) {
				parent = existing._id;
				continue;
			}
			const _id = new mongoose.Types.ObjectId();
			await Folder.create({ _id, name, parent, slug: folderSlug(name, _id) });
			parent = _id;
		}
		return res.status(200).json({ folder: parent });
	} catch (e: any) {
		return fail(res, e);
	}
});

router.patch('/folders/:id', ...edit, async (req: any, res: Response) => {
	try {
		const name = String(req.body?.name || '').trim();
		if (!name) return res.status(400).json({ message: 'Name is required' });
		const folder: any = await Folder.findOne({ _id: req.params.id, ...live });
		if (!folder) return res.status(404).json({ message: 'Folder not found' });
		if (await siblingFolderExists(name, folder.parent, folder._id)) {
			return res.status(409).json({ message: `A folder named "${name}" already exists here` });
		}
		folder.name = name;
		await folder.save();
		return res.status(200).json({ message: 'Folder renamed', doc: folder });
	} catch (e: any) {
		return fail(res, e);
	}
});

/* ------------------------------------------------------------------- files */

router.patch('/files/:id', ...edit, async (req: any, res: Response) => {
	try {
		const name = String(req.body?.name || '').trim();
		if (!name) return res.status(400).json({ message: 'Name is required' });
		const doc = await File.findOneAndUpdate(
			{ _id: req.params.id, ...live },
			{ $set: { name } },
			{ new: true }
		);
		if (!doc) return res.status(404).json({ message: 'File not found' });
		return res.status(200).json({ message: 'File renamed', doc });
	} catch (e: any) {
		return fail(res, e);
	}
});

// Real copy: duplicates the S3 object so the copy survives the original's deletion.
router.post('/copy', ...create, async (req: any, res: Response) => {
	try {
		const ids = toIds(req.body?.files);
		const files: any[] = await File.find({ _id: { $in: ids }, ...live }).lean();
		const s3 = getS3();
		const created: any[] = [];
		for (const file of files) {
			const bucket = file.bucket || process.env.S3_BUCKET_NAME!;
			const safeName = String(file.name || file.key).replace(/[^\w.-]+/g, '_');
			const key = `${Date.now()}_copy_${safeName}`;
			await s3
				.copyObject({
					Bucket: bucket,
					CopySource: `${bucket}/${encodeURIComponent(file.key)}`,
					Key: key,
					ContentType: file.type,
					MetadataDirective: 'REPLACE',
				})
				.promise();
			const base = String(file.url).slice(0, String(file.url).lastIndexOf('/') + 1);
			const { _id, createdAt, updatedAt, id, fileSize, ...rest } = file;
			created.push(
				await File.create({
					...rest,
					name: `Copy of ${file.name || file.key}`,
					key,
					url: `${base}${key}`,
					bucket,
				})
			);
		}
		return res.status(201).json({ message: `${created.length} copied`, doc: created });
	} catch (e: any) {
		return fail(res, e);
	}
});

// Streams the object with a download disposition — S3 URLs are cross-origin, so
// an <a download> on them just opens the file instead.
router.get('/download/:id', ...view, async (req: any, res: Response) => {
	try {
		const file: any = await File.findById(req.params.id).lean();
		if (!file) return res.status(404).json({ message: 'File not found' });
		const stream = getS3()
			.getObject({ Bucket: file.bucket || process.env.S3_BUCKET_NAME!, Key: file.key })
			.createReadStream();
		const filename = String(file.name || file.key).replace(/["\\\r\n]/g, '');
		res.setHeader('Content-Type', file.type || 'application/octet-stream');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
		);
		stream.on('error', (e: any) => {
			if (!res.headersSent) res.status(500).json({ message: e.message });
			else res.end();
		});
		stream.pipe(res);
	} catch (e: any) {
		return fail(res, e);
	}
});

// Any-type upload into a folder id (or root). Raster images become webp like the
// existing image uploads; SVG/GIF (would lose vectors/animation), video and
// documents go up untouched.
router.post('/upload', ...create, upload.single('file'), async (req: any, res: Response) => {
	const tmp = req?.file?.path;
	try {
		const file = req.file;
		if (!file) return res.status(400).json({ message: 'No file uploaded' });
		const parent = folderOrRoot(req.body?.folder);
		const folderDoc: any = parent ? await Folder.findOne({ _id: parent, ...live }).lean() : null;
		if (parent && !folderDoc) return res.status(404).json({ message: 'Folder not found' });

		const mime = file.mimetype || 'application/octet-stream';
		const convert = mime.startsWith('image/') && !/svg|gif/.test(mime);
		const fileType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document';

		let body: Buffer;
		let type = mime;
		let width: number | undefined;
		let height: number | undefined;
		let originalName = file.originalname;
		if (convert) {
			const out = await sharp(tmp)
				.webp({ quality: 50, force: true, alphaQuality: 80 })
				.toBuffer({ resolveWithObject: true });
			body = out.data;
			width = out.info.width;
			height = out.info.height;
			type = 'image/webp';
			originalName = originalName.replace(/\.[^.]+$/, '') + '.webp';
		} else {
			body = fs.readFileSync(tmp);
			if (fileType === 'image') {
				const meta = await sharp(body).metadata().catch(() => ({}) as any);
				width = meta?.width;
				height = meta?.height;
			}
		}

		const s3 = getS3();
		const uploaded: any = await s3
			.upload({
				Bucket: process.env.S3_BUCKET_NAME!,
				Body: body,
				Key: `${Date.now()}_${file.originalname}`,
				ContentType: type,
			})
			.promise();

		const doc = await File.create({
			name: originalName,
			url: uploaded.Location,
			key: uploaded.Key,
			type,
			fileType,
			fileFolder: parent,
			folder: folderDoc?.slug || 'default',
			bucket: uploaded.Bucket,
			size: body.length,
			width,
			height,
		});
		return res.status(201).json({ message: 'File uploaded', doc });
	} catch (e: any) {
		return fail(res, e);
	} finally {
		if (tmp) fs.unlink(tmp, () => {});
	}
});

/* -------------------------------------------------------------------- move */

// Bulk move files and/or folders into `target` (a folder id, or null for root).
// A folder can't go into itself or its own subtree; a moved folder whose name is
// taken at the destination gets a " (2)" suffix.
router.post('/move', ...edit, async (req: any, res: Response) => {
	try {
		const target = folderOrRoot(req.body?.target);
		const fileIds = toIds(req.body?.files);
		const folderIds = toIds(req.body?.folders);

		if (target) {
			if (!(await Folder.exists({ _id: target, ...live }))) {
				return res.status(404).json({ message: 'Destination folder not found' });
			}
			const chain = (await folderPath(target)).map((f: any) => String(f._id));
			if (folderIds.some(id => chain.includes(String(id)))) {
				return res.status(400).json({ message: "A folder can't be moved into itself" });
			}
		}

		// Remember where things were so the client can offer Undo.
		const [prevFiles, prevFolders]: any = await Promise.all([
			File.find({ _id: { $in: fileIds }, ...live }, { fileFolder: 1 }).lean(),
			Folder.find({ _id: { $in: folderIds }, ...live }, { parent: 1, name: 1 }).lean(),
		]);

		if (fileIds.length) {
			await File.updateMany({ _id: { $in: fileIds }, ...live }, { $set: { fileFolder: target } });
		}
		const renamed: any[] = [];
		for (const f of prevFolders) {
			if (String(f.parent || '') === String(target || '')) continue;
			const name = await uniqueFolderName(f.name, target, f._id);
			await Folder.updateOne({ _id: f._id }, { $set: { parent: target, name } });
			if (name !== f.name) renamed.push({ _id: f._id, from: f.name, to: name });
		}

		return res.status(200).json({
			message: `Moved ${prevFiles.length + prevFolders.length} item(s)`,
			moved: { files: prevFiles.length, folders: prevFolders.length },
			renamed,
			previous: {
				files: prevFiles.map((f: any) => ({ _id: f._id, folder: f.fileFolder || null })),
				folders: prevFolders.map((f: any) => ({ _id: f._id, folder: f.parent || null })),
			},
		});
	} catch (e: any) {
		return fail(res, e);
	}
});

/* ------------------------------------------------------------------- trash */

// Soft delete. A trashed folder takes its whole subtree with it; everything
// gets the same trashRoot so it can be restored or purged as one.
router.post('/trash', ...remove, async (req: any, res: Response) => {
	try {
		const fileIds = toIds(req.body?.files);
		const folderIds = toIds(req.body?.folders);
		const now = new Date();

		for (const id of fileIds) {
			await File.updateOne({ _id: id, ...live }, { $set: { trashedAt: now, trashRoot: id } });
		}
		for (const id of folderIds) {
			const folder = await Folder.findOne({ _id: id, ...live }, { _id: 1 }).lean();
			if (!folder) continue;
			const subtree = [id, ...(await descendantFolderIds([id]))];
			await Folder.updateMany(
				{ _id: { $in: subtree }, ...live },
				{ $set: { trashedAt: now, trashRoot: id } }
			);
			await File.updateMany(
				{ fileFolder: { $in: subtree }, ...live },
				{ $set: { trashedAt: now, trashRoot: id } }
			);
		}
		return res.status(200).json({ message: 'Moved to trash', files: fileIds, folders: folderIds });
	} catch (e: any) {
		return fail(res, e);
	}
});

// What the user trashed directly (trashRoot is the item itself) — the contents
// of a trashed folder stay inside it, as in Drive.
router.get('/trash', ...view, async (req: any, res: Response) => {
	try {
		const [folders, files] = await Promise.all([
			Folder.find({ trashedAt: { $ne: null }, $expr: { $eq: ['$trashRoot', '$_id'] } })
				.sort({ trashedAt: -1 })
				.lean(),
			File.find({ trashedAt: { $ne: null }, $expr: { $eq: ['$trashRoot', '$_id'] } })
				.sort({ trashedAt: -1 })
				.lean(),
		]);
		return res.status(200).json({ folders: await withCounts(folders as any[], true), files, days: TRASH_DAYS });
	} catch (e: any) {
		return fail(res, e);
	}
});

// Brings back everything trashed with each given item. Items whose original
// folder is gone (or still in the trash) land in root.
router.post('/restore', ...remove, async (req: any, res: Response) => {
	try {
		const roots = [...toIds(req.body?.files), ...toIds(req.body?.folders)];
		for (const root of roots) {
			const folderTop: any = await Folder.findOne({ _id: root, trashRoot: root }).lean();
			const top: any = folderTop || (await File.findOne({ _id: root, trashRoot: root }).lean());
			if (!top) continue;
			const isFolder = !!folderTop;
			const origin = isFolder ? top.parent : top.fileFolder;
			const originLive = origin ? await Folder.exists({ _id: origin, ...live }) : true;

			await Folder.updateMany({ trashRoot: root }, { $set: { trashedAt: null, trashRoot: null } });
			await File.updateMany({ trashRoot: root }, { $set: { trashedAt: null, trashRoot: null } });

			const destination = originLive ? origin || null : null;
			if (isFolder) {
				const name = await uniqueFolderName(top.name, destination, top._id);
				await Folder.updateOne({ _id: root }, { $set: { parent: destination, name } });
			} else if (!originLive) {
				await File.updateOne({ _id: root }, { $set: { fileFolder: null } });
			}
		}
		return res.status(200).json({ message: 'Restored' });
	} catch (e: any) {
		return fail(res, e);
	}
});

// Permanent: deletes everything trashed with the given items (or the whole trash
// with `all: true`), then their S3 objects — each only once nothing else uses it.
const purge = async (roots: mongoose.Types.ObjectId[] | 'all') => {
	const match: any = roots === 'all' ? { trashedAt: { $ne: null } } : { trashRoot: { $in: roots } };
	const files: any[] = await File.find(match, { key: 1, bucket: 1 }).lean();
	await File.deleteMany({ _id: { $in: files.map(f => f._id) } });
	await Folder.deleteMany(match);
	let failed = 0;
	for (const f of files) {
		try {
			await deleteS3ObjectIfUnused(f.key, f.bucket);
		} catch {
			failed++;
		}
	}
	return { files: files.length, failed };
};

router.post('/purge', ...remove, async (req: any, res: Response) => {
	try {
		const roots = req.body?.all
			? 'all'
			: [...toIds(req.body?.files), ...toIds(req.body?.folders)];
		const result = await purge(roots);
		return res.status(200).json({ message: 'Deleted forever', ...result });
	} catch (e: any) {
		return fail(res, e);
	}
});

// Sweep every 6 hours (and once shortly after boot): anything in the trash
// longer than TRASH_DAYS is deleted forever.
export const scheduleTrashPurge = () => {
	const sweep = async () => {
		try {
			const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000);
			const [f1, f2] = await Promise.all([
				Folder.distinct('trashRoot', { trashedAt: { $ne: null, $lt: cutoff } }),
				File.distinct('trashRoot', { trashedAt: { $ne: null, $lt: cutoff } }),
			]);
			const roots = [...f1, ...f2].filter(Boolean) as any[];
			if (roots.length) {
				const result = await purge(roots);
				console.log(`Media trash: purged ${result.files} file(s) older than ${TRASH_DAYS} days`);
			}
		} catch (e: any) {
			console.error(`Media trash purge: ${e.message}`);
		}
	};
	setTimeout(sweep, 60 * 1000);
	setInterval(sweep, 6 * 60 * 60 * 1000);
};

export default router;
