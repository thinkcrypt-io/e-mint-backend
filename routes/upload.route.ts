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

// Get total S3 bucket storage using CloudWatch
router.get('/storage', async (req: Request, res: Response) => {
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

// Get current month's S3 cost using Cost Explorer
router.get('/cost', async (req: Request, res: Response) => {
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
			Filter: {
				Dimensions: {
					Key: 'SERVICE',
					Values: ['Amazon Simple Storage Service'],
				},
			},
		};

		costExplorer.getCostAndUsage(
			params,
			(err: AWS.AWSError | null, data: AWS.CostExplorer.GetCostAndUsageResponse) => {
				if (err) {
					console.error('Cost Explorer error:', err);
					return res.status(500).json({ message: err.message });
				}

				const result = data.ResultsByTime?.[0];
				const s3Group = result?.Groups?.find(group =>
					group.Keys?.includes('Amazon Simple Storage Service')
				);

				const blendedCost = parseFloat(s3Group?.Metrics?.BlendedCost?.Amount || '0');
				const unblendedCost = parseFloat(s3Group?.Metrics?.UnblendedCost?.Amount || '0');
				const currency = s3Group?.Metrics?.BlendedCost?.Unit || 'USD';

				return res.status(200).json({
					message: 'S3 cost fetched successfully',
					period: {
						start: startOfMonth.toISOString().split('T')[0],
						end: endOfMonth.toISOString().split('T')[0],
					},
					cost: {
						blended: blendedCost,
						unblended: unblendedCost,
						currency,
					},
				});
			}
		);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
});

export default router;
