import express, { Request, Response } from 'express';
import multer from 'multer';
import { AdminFile as File, Folder } from '../../models/_index.js';
import { paginate, adminProtect as protect } from '../../middlewares/_index.js';
import { getDistinctFields } from '../../controllers/index.js';
import {
	deleteFileByKey,
	getFiles,
	uploadSingleFile,
	uploadSingleImage,
	uploadSingleVideo,
} from '../../controllers/upload/_index.js';

const router = express.Router();
const uploadFile = multer({ dest: 'from/' });
const uploadVideo = multer({
	dest: 'from/',
	limits: {
		fileSize: 50 * 1024 * 1024, // 50MB limit
	},
	fileFilter: (req, file, cb) => {
		if (file.mimetype.startsWith('video/')) {
			cb(null, true);
		} else {
			cb(new Error('Invalid file type. Only video files are allowed.'));
		}
	},
});

router.get('/', protect, paginate, getFiles({ model: File }));
router.delete('/:key', protect, deleteFileByKey({ model: File }));
// uploads a file to s3
router.post(
	'/',
	protect,
	uploadFile.single('image'),
	uploadSingleImage({ file: File, folder: Folder })
);
router.post('/file', protect, uploadFile.single('file'), uploadSingleFile({ model: File }));
router.post('/video', protect, uploadVideo.single('image'), uploadSingleVideo({ model: File }));
router.get('/get/distinct/:key', protect, getDistinctFields({ model: File }));

export default router;
