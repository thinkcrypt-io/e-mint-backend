import fs from 'fs';
import AWS from 'aws-sdk';
import express, { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import File from '../../models/file/adminFile.model.js';
import { paginate, adminProtect as protect } from '../../middleware/index.js';
import { getDistinctFields } from '../../imports.js';

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

router.get('/', protect, paginate, async (req: any, res: Response) => {
	try {
		const { sort, limit = 10, skip = 0, fields, page }: any = req.meta;
		const { type = 'image', folder } = req.query;
		let query: any = { fileType: type };
		if (folder) query.folder = folder;

		const doc = await File.find(query).sort('-createdAt').limit(limit).skip(skip);

		const count: number = await File.countDocuments(query);

		req.meta.docsInPage = doc.length;
		req.meta.totalDocs = count;
		req.meta.totalPages = Math.ceil(count / limit);

		return res.status(200).json({ message: 'Files fetched successfully', doc, ...req.meta });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
});

router.delete('/:key', async (req: Request, res: Response) => {
	try {
		AWS.config.update({
			region: process.env.AWS_REGION,
			accessKeyId: process.env.AWS_ACCESS_KEY,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			signatureVersion: 'v4',
		});

		const s3 = new AWS.S3();

		const params: any = {
			Bucket: process.env.S3_BUCKET_NAME,
			Key: req.params.key,
		};

		s3.deleteObject(params, async function (err, data) {
			if (err) return res.status(500).json({ message: err });
			if (data) {
				const deleted = await File.findOneAndDelete({ key: req.params.key });
				if (deleted) return res.status(200).json({ message: 'File deleted successfully' });
				else return res.status(404).json({ message: 'File not found in database' });
			}
		});
	} catch (e: any) {
		console.error(e.message);
		res.status(500).json({ message: e.message });
	}
});

// uploads a file to s3
router.post('/', protect, uploadFile.single('image'), async (req: any, res: Response) => {
	try {
		AWS.config.update({
			region: process.env.AWS_REGION,
			accessKeyId: process.env.AWS_ACCESS_KEY,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			signatureVersion: 'v4',
		});

		const s3 = new AWS.S3();

		const fileName = `${Date.now()}_${req?.file?.originalname}`;

		const data = await sharp(req?.file?.path)
			.webp({ quality: 50, force: true, alphaQuality: 80 })
			.toBuffer();

		var params: any = {
			Bucket: process.env.S3_BUCKET_NAME,
			Body: data,
			Key: fileName,
		};

		s3.upload(params, async (err: any, data: any): Promise<any> => {
			if (err) return res.status(500).json({ message: err.message });
			if (data) {
				// Get metadata of the uploaded file
				const metadata = await s3.headObject({ Bucket: params.Bucket, Key: params.Key }).promise();

				// Add the size to the response
				data.size = metadata.ContentLength;

				const newFile = new File({
					name: data.Key,
					url: data.Location,
					key: data.Key,
					type: req?.file?.mimetype,
					fileType: 'image',
					bucket: data.Bucket,
					size: data.size,
					folder: (req as any)?.body?.folder,
				});

				const saved = await newFile.save();

				return res
					.status(200)
					.json({ message: 'File uploaded successfully', data: saved, file: data });
			}
		});

		if (req?.file?.path) {
			fs.unlinkSync(req.file.path);
		}
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
});

router.post('/file', protect, uploadFile.single('file'), async (req: Request, res: Response) => {
	try {
		AWS.config.update({
			region: process.env.AWS_REGION,
			accessKeyId: process.env.AWS_ACCESS_KEY,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			signatureVersion: 'v4',
		});

		const s3 = new AWS.S3();

		const fileName = `${Date.now()}_${req?.file?.originalname}`;

		const fileContent = fs.readFileSync((req as any)?.file?.path);

		const params: AWS.S3.PutObjectRequest = {
			Bucket: process.env.S3_BUCKET_NAME!,
			Body: fileContent,
			Key: fileName,
			ContentType: req?.file?.mimetype,
		};

		s3.upload(params, async (err: any, data: any): Promise<any> => {
			if (err) return res.status(500).json({ message: err.message });
			if (data) {
				// Get metadata of the uploaded file
				const metadata = await s3.headObject({ Bucket: params.Bucket, Key: params.Key }).promise();

				// Add the size to the response
				data.size = metadata.ContentLength;
				const newFile = new File({
					name: data.Key,
					url: data.Location,
					key: data.Key,
					type: req?.file?.mimetype,
					bucket: data.Bucket,
					fileType: 'document',
					size: data.size,
					folder: req.body?.folder,
				});

				const saved = await newFile.save();

				return res
					.status(200)
					.json({ message: 'File uploaded successfully', data: saved, file: data });
			}
		});

		if (req?.file?.path) {
			fs.unlinkSync(req.file.path);
		}
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
});

router.post('/video', protect, uploadVideo.single('image'), async (req: Request, res: Response) => {
	try {
		// Check if file exists
		if (!req.file) {
			return res.status(400).json({ message: 'No video file uploaded' });
		}

		AWS.config.update({
			region: process.env.AWS_REGION,
			accessKeyId: process.env.AWS_ACCESS_KEY,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			signatureVersion: 'v4',
		});

		const s3 = new AWS.S3();

		const fileName = `${Date.now()}_${req?.file?.originalname}`;
		const fileContent = fs.readFileSync((req as any)?.file?.path);

		const params: AWS.S3.PutObjectRequest = {
			Bucket: process.env.S3_BUCKET_NAME!,
			Body: fileContent,
			Key: fileName,
			ContentType: req?.file?.mimetype,
		};

		s3.upload(params, async (err: any, data: any): Promise<any> => {
			if (err) return res.status(500).json({ message: err.message });
			if (data) {
				// Get metadata of the uploaded file
				const metadata = await s3.headObject({ Bucket: params.Bucket, Key: params.Key }).promise();

				// Add the size to the response
				data.size = metadata.ContentLength;
				const newFile = new File({
					name: data.Key,
					url: data.Location,
					key: data.Key,
					type: req?.file?.mimetype,
					bucket: data.Bucket,
					fileType: 'video',
					size: data.size,
					folder: req.body?.folder,
				});

				const saved = await newFile.save();

				return res
					.status(200)
					.json({ message: 'File uploaded successfully', data: saved, file: data });
			}
		});

		if (req?.file?.path) {
			fs.unlinkSync(req?.file?.path);
		}
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
});

router.get('/get/distinct/:key', protect, getDistinctFields({ model: File }));

export default router;
