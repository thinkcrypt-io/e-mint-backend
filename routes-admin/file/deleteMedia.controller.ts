import AWS from 'aws-sdk';
import { Response } from 'express';
import mongoose from 'mongoose';

const deleteMedia = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response) => {
		try {
			// First, find the file by ID to get the key
			const file = await model.findById(req.params.id);

			if (!file) {
				return res.status(404).json({ message: 'File not found in database' });
			}

			AWS.config.update({
				region: process.env.AWS_REGION,
				accessKeyId: process.env.AWS_ACCESS_KEY,
				secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
				signatureVersion: 'v4',
			});

			const s3 = new AWS.S3();

			const params: any = {
				Bucket: process.env.S3_BUCKET_NAME,
				Key: file.key, // Use the key from the found file
			};

			s3.deleteObject(params, async function (err, data) {
				if (err) return res.status(500).json({ message: err });
				if (data) {
					const deleted = await model.findByIdAndDelete(file?._id);

					if (deleted)
						return res
							.status(200)
							.json({ message: 'File deleted successfully', data, key: file.key, params });
					else return res.status(404).json({ message: 'File not found in database' });
				} else {
					await model.findByIdAndDelete(file?._id);
					return res.status(404).json({ message: 'File not found in database' });
				}
			});
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default deleteMedia;
