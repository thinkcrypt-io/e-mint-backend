import { Response } from 'express';
import jwt from 'jsonwebtoken';

const verifyToken = async (req: any, res: Response) => {
	const token = req.params.token;
	try {
		const decoded: any = jwt.verify(token, process.env.JWT_PRIVATE_KEY!);
		return res
			.status(200)
			.json({ id: decoded.id, email: decoded.email, token: token });
	} catch (e: any) {
		console.log(e.message);
		res.status(401).json({ message: 'This Link has expired' });
	}
};

export default verifyToken;
