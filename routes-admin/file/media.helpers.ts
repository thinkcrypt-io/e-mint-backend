import AWS from 'aws-sdk';
import mongoose from 'mongoose';
import File from '../../library/models/admin-file/model.js';
import Folder from '../../library/models/folders/model.js';
import { generateSlug } from '../../library/models/_functions/_index.js';
import { runUnscoped } from '../../library/functions/tenantScope.function.js';

export const getS3 = (): AWS.S3 => {
	AWS.config.update({
		region: process.env.AWS_REGION,
		accessKeyId: process.env.AWS_ACCESS_KEY,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
		signatureVersion: 'v4',
	});
	return new AWS.S3();
};

// "Make Copy" used to create a second File document pointing at the same S3 key,
// so deleting either one removed the object out from under the other. Only delete
// the object once no remaining File document references it.
export const deleteS3ObjectIfUnused = async (key: string, bucket?: string) => {
	if (!key) return;
	// Across every scope (docs/multi-tenancy): a File in one tenant project must
	// never be a way to delete an object another project or the super admin uses.
	const stillUsed = await runUnscoped(() => File.exists({ key }));
	if (stillUsed) return;
	await getS3()
		.deleteObject({ Bucket: bucket || process.env.S3_BUCKET_NAME!, Key: key })
		.promise();
};

export const isObjectId = (value: any) =>
	typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) && /^[a-f\d]{24}$/i.test(value);

// Media-manager folders get a slug suffixed with part of their id. Folder names
// only have to be unique within a parent, but `slug` carries a global unique
// index — the suffix keeps two "Banners" folders in different parents from
// colliding without a migration.
export const folderSlug = (name: string, id: mongoose.Types.ObjectId) =>
	`${generateSlug(name) || 'folder'}-${String(id).slice(-6)}`;

// Uploads name their target either by folder id (the media manager, and the
// upload modal inside a folder) or by a legacy slug string ('default', 'products'…).
// Before this, an id was looked up as a slug, missed, and created a junk
// root-level folder named after the id.
export const resolveUploadFolder = async (folder: string) => {
	if (isObjectId(folder)) {
		const byId = await Folder.findOne({ _id: folder, trashedAt: null });
		if (byId) return byId;
	}
	const bySlug = await Folder.findOne({ slug: folder, trashedAt: null });
	if (bySlug) return bySlug;
	return new Folder({ name: folder, slug: folder }).save();
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive "is this name taken by a live sibling folder?"
export const siblingFolderExists = async (name: string, parent: any, excludeId?: any) =>
	!!(await Folder.exists({
		parent: parent || null,
		trashedAt: null,
		name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
		...(excludeId && { _id: { $ne: excludeId } }),
	}));

// "Name", "Name (2)", "Name (3)"… — first one no live sibling uses.
export const uniqueFolderName = async (name: string, parent: any, excludeId?: any) => {
	const base = name.trim() || 'Untitled folder';
	if (!(await siblingFolderExists(base, parent, excludeId))) return base;
	for (let n = 2; n < 1000; n++) {
		const candidate = `${base} (${n})`;
		if (!(await siblingFolderExists(candidate, parent, excludeId))) return candidate;
	}
	return `${base} (${Date.now()})`;
};

// Ids of every folder below `rootIds` (not including them), live or trashed.
export const descendantFolderIds = async (rootIds: any[]) => {
	const out: any[] = [];
	let frontier = rootIds;
	while (frontier.length) {
		const children = await Folder.find({ parent: { $in: frontier } }, { _id: 1 }).lean();
		frontier = children.map((c: any) => c._id);
		out.push(...frontier);
	}
	return out;
};

// Root → folder chain for breadcrumbs. Stops at a missing parent or a cycle.
export const folderPath = async (id: any) => {
	const path: any[] = [];
	const seen = new Set<string>();
	let current: any = await Folder.findById(id, { name: 1, parent: 1, trashedAt: 1 }).lean();
	while (current && !seen.has(String(current._id))) {
		seen.add(String(current._id));
		path.unshift({ _id: current._id, name: current.name, trashedAt: current.trashedAt });
		current = current.parent
			? await Folder.findById(current.parent, { name: 1, parent: 1, trashedAt: 1 }).lean()
			: null;
	}
	return path;
};
