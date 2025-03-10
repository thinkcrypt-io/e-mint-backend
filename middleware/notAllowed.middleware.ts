import { NextFunction, Response } from 'express';

const notAllowed = (req: any, res: Response, next: NextFunction): Response | void => {
	try {
		return res.status(404).json({ message: 'This Action is not allowed' });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default notAllowed;
