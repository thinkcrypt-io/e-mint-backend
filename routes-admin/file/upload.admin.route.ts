import fs from 'fs';
import AWS from 'aws-sdk';
import express, { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import File from '../../library/models/admin-file/model.js';
import Folder from '../../library/models/folders/model.js';
import { paginate, adminProtect as protect } from '../../middleware/index.js';
import { getDistinctFields } from '../../imports.js';

const router = express.Router();

const uploadFile = multer({ dest: 'from/' });
const uploadMultipleFiles = multer({ dest: 'from/', limits: { fileSize: 10 * 1024 * 1024 } });

const getS3 = (): AWS.S3 => {
	AWS.config.update({
		region: process.env.AWS_REGION,
		accessKeyId: process.env.AWS_ACCESS_KEY,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
		signatureVersion: 'v4',
	});
	return new AWS.S3();
};

// Shared per-file pipeline: convert to webp, upload to S3, resolve/create the target
// Folder, and save the File document. Used by both the single-file and multi-file routes.
const processAndUploadImage = async (
	file: Express.Multer.File,
	folder: string
): Promise<any> => {
	const s3 = getS3();

	const fileName = `${Date.now()}_${file.originalname}`;

	const data = await sharp(file.path).webp({ quality: 50, force: true, alphaQuality: 80 }).toBuffer();

	const params: any = {
		Bucket: process.env.S3_BUCKET_NAME,
		Body: data,
		Key: fileName,
	};

	const uploaded: any = await s3.upload(params).promise();

	const metadata = await s3.headObject({ Bucket: params.Bucket, Key: params.Key }).promise();
	uploaded.size = metadata.ContentLength;

	let findFolder = await Folder.findOne({ slug: folder });

	if (!findFolder) {
		const newFolder = new Folder({ name: folder, slug: folder });
		findFolder = await newFolder.save();
	}

	const newFile = new File({
		name: uploaded.Key,
		url: uploaded.Location,
		key: uploaded.Key,
		type: file.mimetype,
		fileType: 'image',
		fileFolder: findFolder._id,
		bucket: uploaded.Bucket,
		size: uploaded.size,
		folder: folder,
	});

	return newFile.save();
};

// Makes the (near-)white paper background behind a signature transparent,
// scaling alpha by pixel luminance so dark ink stays opaque and white
// background disappears, with a soft falloff at the anti-aliased edges.
const stripWhiteBackground = async (imagePath: string): Promise<Buffer> => {
	const { data, info } = await sharp(imagePath)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const { width, height, channels } = info;

	for (let i = 0; i < data.length; i += channels) {
		const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
		const alpha = 255 - luminance;
		data[i + 3] = Math.min(data[i + 3], Math.round(alpha));
	}

	return sharp(data, { raw: { width, height, channels } })
		.webp({ quality: 90, alphaQuality: 100 })
		.toBuffer();
};

// Uploads a signature image straight to S3 without creating a File/media-library
// record — signatures are personal to the admin account and shouldn't show up
// in the shared media library or be reusable as generic uploads.
router.post(
	'/signature',
	protect,
	uploadFile.single('image'),
	async (req: any, res: Response) => {
		try {
			if (!req.file) {
				return res.status(400).json({ message: 'No image file uploaded' });
			}

			const s3 = getS3();
			const fileName = `signatures/${req.user._id}_${Date.now()}.webp`;

			const data = await stripWhiteBackground(req.file.path);

			const uploaded: any = await s3
				.upload({
					Bucket: process.env.S3_BUCKET_NAME!,
					Body: data,
					Key: fileName,
				})
				.promise();

			return res.status(200).json({
				message: 'Signature uploaded successfully',
				data: { url: uploaded.Location, key: uploaded.Key },
			});
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		} finally {
			if (req?.file?.path) fs.unlink(req.file.path, () => {});
		}
	}
);

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
		if (!req.file) {
			return res.status(400).json({ message: 'No image file uploaded' });
		}

		const folder = req?.body?.folder || 'default';
		const saved = await processAndUploadImage(req.file, folder);

		return res.status(200).json({ message: 'File uploaded successfully', data: saved });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	} finally {
		if (req?.file?.path) fs.unlink(req.file.path, () => {});
	}
});

// uploads multiple images to s3, partial success allowed
router.post(
	'/multiple',
	protect,
	uploadMultipleFiles.array('images', 20),
	async (req: any, res: Response) => {
		try {
			const files = (req.files as Express.Multer.File[]) || [];
			const folder = req?.body?.folder || 'default';

			const results = await Promise.all(
				files.map(async (file) => {
					try {
						const saved = await processAndUploadImage(file, folder);
						return { originalName: file.originalname, ok: true, data: saved };
					} catch (e: any) {
						return { originalName: file.originalname, ok: false, error: e.message };
					} finally {
						if (file.path) fs.unlink(file.path, () => {});
					}
				})
			);

			const uploaded = results.filter((r) => r.ok).length;
			const failed = results.length - uploaded;

			return res.status(200).json({
				message: `${uploaded} file(s) uploaded, ${failed} failed`,
				uploaded,
				failed,
				results,
			});
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	}
);

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

router.get('/get/sum/s3', async (req: Request, res: Response) => {
	try {
		if (!process.env.S3_BUCKET_NAME) {
			return res.status(400).json({ message: 'S3_BUCKET_NAME environment variable is not set' });
		}

		AWS.config.update({
			region: process.env.AWS_REGION,
			accessKeyId: process.env.AWS_ACCESS_KEY,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
		});

		const cloudwatch = new AWS.CloudWatch();

		const params: AWS.CloudWatch.GetMetricStatisticsInput = {
			Namespace: 'AWS/S3',
			MetricName: 'BucketSizeBytes',
			Dimensions: [
				{
					Name: 'BucketName',
					Value: process.env.S3_BUCKET_NAME,
				},
				{
					Name: 'StorageType',
					Value: 'StandardStorage',
				},
			],
			StartTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
			EndTime: new Date(),
			Period: 86400, // 1 day in seconds
			Statistics: ['Average'],
		};

		cloudwatch.getMetricStatistics(
			params,
			(err: AWS.AWSError | null, data: AWS.CloudWatch.GetMetricStatisticsOutput) => {
				if (err) {
					console.error('CloudWatch error:', err);
					return res.status(500).json({ message: err.message });
				}

				// Get the latest datapoint
				const latestDatapoint = data.Datapoints?.sort(
					(a: any, b: any) => new Date(b.Timestamp!).getTime() - new Date(a.Timestamp!).getTime()
				)[0];

				const totalBytes = latestDatapoint?.Average || 0;

				return res.status(200).json({
					message: 'Storage fetched successfully',
					total: totalBytes,
					timestamp: latestDatapoint?.Timestamp,
				});
			}
		);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
});

router.get('/get/sum/awsbill', async (req: Request, res: Response) => {
	try {
		AWS.config.update({
			region: process.env.AWS_REGION,
			accessKeyId: process.env.AWS_ACCESS_KEY,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
		});

		const costExplorer = new AWS.CostExplorer({ region: 'us-east-1' }); // Cost Explorer only works in us-east-1

		// Get current month start and end dates
		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

		const params: AWS.CostExplorer.GetCostAndUsageRequest = {
			TimePeriod: {
				Start: startOfMonth.toISOString().split('T')[0], // YYYY-MM-DD format
				End: endOfMonth.toISOString().split('T')[0],
			},
			Granularity: 'MONTHLY',
			Metrics: ['BlendedCost', 'UnblendedCost'],
			GroupBy: [
				{
					Type: 'DIMENSION',
					Key: 'SERVICE',
				},
			],
		};

		costExplorer.getCostAndUsage(
			params,
			(err: AWS.AWSError | null, data: AWS.CostExplorer.GetCostAndUsageResponse) => {
				if (err) {
					console.error('Cost Explorer error:', err);
					return res.status(500).json({ message: err.message });
				}

				const result = data.ResultsByTime?.[0];

				// Calculate total cost across all services
				let totalBlendedCost = 0;
				let totalUnblendedCost = 0;
				let currency = 'USD';

				// Get breakdown by service
				const serviceBreakdown =
					result?.Groups?.map(group => {
						const serviceName = group.Keys?.[0] || 'Unknown';
						const blended = parseFloat(group.Metrics?.BlendedCost?.Amount || '0');
						const unblended = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');

						totalBlendedCost += blended;
						totalUnblendedCost += unblended;

						if (group.Metrics?.BlendedCost?.Unit) {
							currency = group.Metrics.BlendedCost.Unit;
						}

						return {
							service: serviceName,
							blended,
							unblended,
						};
					}) || [];

				return res.status(200).json({
					message: 'Total AWS cost fetched successfully',
					period: {
						start: startOfMonth.toISOString().split('T')[0],
						end: endOfMonth.toISOString().split('T')[0],
					},
					totalCost: {
						blended: totalBlendedCost,
						unblended: totalUnblendedCost,
						currency,
					},
					serviceBreakdown,
				});
			}
		);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
});

router.get('/get/distinct/:key', protect, getDistinctFields({ model: File }));

export default router;
