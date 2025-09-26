import AWS from 'aws-sdk';
import { Response } from 'express';
import fs from 'fs';
import sharp from 'sharp';
import mongoose from 'mongoose';

const uploadSingleImage =
	({ file, folder }: { file: mongoose.Model<any>; folder: mongoose.Model<any> }) =>
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
					const metadata = await s3
						.headObject({ Bucket: params.Bucket, Key: params.Key })
						.promise();

					// Add the size to the response
					data.size = metadata.ContentLength;

					const destinationFolder = req?.body?.folder || 'default';

					let findFolder = await folder.findOne({ slug: destinationFolder });

					if (!findFolder) {
						const newFolder = new folder({
							name: destinationFolder,
							slug: destinationFolder,
						});
						findFolder = await newFolder.save();
					}

					const newFile = new file({
						name: data?.Key,
						url: data?.Location,
						key: data?.Key,
						type: req?.file?.mimetype,
						fileType: 'image',
						fileFolder: findFolder?._id,
						bucket: data?.Bucket,
						size: data?.size,
						folder: destinationFolder,
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

export default uploadSingleImage;
