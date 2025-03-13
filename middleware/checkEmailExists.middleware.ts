import { NextFunction, Request, Response } from 'express';
import mongoose, { Model } from 'mongoose';

interface CheckEmailExistsOptions {
	Model: mongoose.Model<any>;
}

const checkEmailExists = ({ Model }: CheckEmailExistsOptions) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { email } = req.body;
			console.log('email:', email);
			if (!email) {
				return res.status(400).json({ message: 'Email is required' });
			}

			const existingSubscription = await Model.findOne({ email });

			if (existingSubscription) {
				return res.status(400).json({
					message: 'This email is already subscribed.',
				});
			}

			next();
		} catch (error: any) {
			console.error(error);
			return res.status(500).json({
				message:
					process.env.NODE_ENV === 'development'
						? error.message
						: 'Internal Server Error',
			});
		}
	};
};

export default checkEmailExists;
