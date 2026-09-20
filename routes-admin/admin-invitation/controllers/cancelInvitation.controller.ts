import { Request, Response } from 'express';
import { Admin, getErrorMessage } from '../../../imports.js';

const cancelInvitationController = async (req: Request, res: Response): Promise<Response> => {
	try {
		const { id } = req.params;
		const admin = (await Admin.findById(id)) as any;

		if (!admin) return res.status(404).json({ message: 'Admin not found' });
		if (admin.invitationStatus !== 'pending') {
			return res.status(400).json({ message: 'Only a pending invitation can be cancelled' });
		}

		admin.invitationStatus = 'cancelled';
		admin.invitationToken = undefined;
		admin.invitationExpires = undefined;
		await admin.save();

		return res.status(200).json({ message: 'Invitation cancelled' });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).send({ message });
	}
};

export default cancelInvitationController;
