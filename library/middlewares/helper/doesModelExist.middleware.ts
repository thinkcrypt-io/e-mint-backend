import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

const doesModelExist = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { modelName } = req.body;

		if (!modelName) {
			return res.status(400).json({ message: 'Model name is required in the request body.' });
		}

		// Check if the model is registered
		const isModelRegistered = mongoose.modelNames().includes(modelName);

		if (!isModelRegistered) {
			return res.status(400).json({
				message: `Model '${modelName}' is not registered.`,
			});
		}

		next();
	} catch (e: any) {
		console.error(e);
		const message = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
		return res.status(500).json({ message });
	}
};

export default doesModelExist;
