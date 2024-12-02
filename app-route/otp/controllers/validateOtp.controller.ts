import { Request, Response } from 'express';
import Otp from '../../../models/otp/otp.model.js';

const validateOtp = async (req: Request, res: Response) => {
	try {
		const { otp, phone } = req.body;
		const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

		if (!otp) return res.status(400).json({ message: 'OTP is required' });
		if (!phone) return res.status(400).json({ message: 'Phone is required' });

		const ifExists = await Otp.findOne({
			recipient: phone,
			otp,
			createdAt: { $gte: fiveMinutesAgo },
			isActive: true,
		});

		if (!ifExists) {
			return res.status(400).json({ message: 'Invalid or expired OTP' });
		}

		ifExists.isActive = false;
		await ifExists.save();

		return res.status(200).json({ message: 'OTP validated successfully' });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default validateOtp;
