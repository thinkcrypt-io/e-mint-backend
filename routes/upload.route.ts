import fs from 'fs';
import AWS from 'aws-sdk';
import express, { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import File from '../models/file/file.model.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

const uploadFile = multer({ dest: 'from/' });

router.get('/', protect, async (req: Request, res: Response) => {
	try {
		const files = await File.find({ shop: (req as any).shop }).sort('-createdAt');

		return res.status(200).json({ message: 'Files fetched successfully', doc: files });
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

		s3.deleteObject(params, function (err, data) {
			if (err) return res.status(500).json({ message: err });
			if (data) return res.status(200).json({ message: 'File deleted successfully' });
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

		const fileName = `${req?.file?.originalname}_${Date.now()}`;

		const data = await sharp(req?.file?.path)
			.webp({ quality: 5, force: true, alphaQuality: 5 })
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
					shop: req.shop,
					url: data.Location,
					key: data.Key,
					type: req?.file?.mimetype,
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

export default router;
