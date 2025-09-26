import AWS from 'aws-sdk';
import { Response } from 'express';
import fs from 'fs';
import mongoose from 'mongoose';

const uploadSingleFile =
	({ model }: { model: mongoose.Model<any> }) =>
	async (req: any, res: Response) => {
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
					const metadata = await s3
						.headObject({ Bucket: params.Bucket, Key: params.Key })
						.promise();

					// Add the size to the response
					data.size = metadata.ContentLength;
					const newFile = new model({
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
	};

export default uploadSingleFile;
