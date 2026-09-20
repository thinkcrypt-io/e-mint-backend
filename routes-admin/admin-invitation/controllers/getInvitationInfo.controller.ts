import crypto from 'crypto';
import { Request, Response } from 'express';
import { Admin, getErrorMessage } from '../../../imports.js';

const getInvitationInfoController = async (req: Request, res: Response): Promise<Response> => {
	try {
		const { token } = req.params;
		const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

		const admin = (await Admin.findOne({
			invitationToken: hashedToken,
			invitationExpires: { $gt: new Date() },
			invitationStatus: 'pending',
		}).select('email')) as any;

		if (!admin) {
			return res.status(400).json({ message: 'This invitation link is invalid or has expired' });
		}

		return res.status(200).json({ email: admin.email });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).send({ message });
	}
};

export default getInvitationInfoController;
