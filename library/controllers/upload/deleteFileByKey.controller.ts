import AWS from 'aws-sdk';
import { Request, Response } from 'express';
import mongoose from 'mongoose';

type DeleteFileByKeyParams = {
	model: mongoose.Model<any>;
};

const deleteFileByKey =
	({ model }: DeleteFileByKeyParams) =>
	async (req: Request, res: Response) => {
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
					const deleted = await model.findOneAndDelete({ key: req.params.key });
					if (deleted) return res.status(200).json({ message: 'File deleted successfully' });
					else return res.status(404).json({ message: 'File not found in database' });
				}
			});
		} catch (e: any) {
			console.error(e.message);
			res.status(500).json({ message: e.message });
		}
	};

export default deleteFileByKey;
