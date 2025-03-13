import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Response } from 'express';
import Customer from '../../models/customer/customer.model.js';

const resetPassword = async (req: any, res: Response) => {
	const { token, password } = req.body;
	try {
		const decoded: any = jwt.verify(token, process.env.JWT_PRIVATE_KEY!);
		const { email, _id } = decoded;

		let data = await Customer.findById(_id);
		
		if (!data) return res.status(404).json({ message: 'User Not Found' });

		const salt = await bcrypt.genSalt(10);
		data.password = password;

		const saved = await data.save();
		return res.status(200).json({ message: 'Password Updated Successfully' });
	} catch (e: any) {
		console.log(e.message);
		// return res.status(500).json({ message: 'Your link has expired' });
		return res.status(500).json({ message: e.message });
	}
};

export default resetPassword;
