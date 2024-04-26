import { Request, Response } from 'express';
import sendMail from '../mail/sendMail.controller.js';
import Leave, { settings } from '../../models/leave/leave.model.js';

const updateLeave = async (req: Request, res: Response) => {
	const { status } = req.body;
	const id = req.params.id;

	try {
		const item = await (Leave as any).findById(id).populate('employee');
		if (!item) {
			return res.status(400).json({ messaage: 'Item not found' });
		}

		if (!item?.isActive) {
			return res.status(400).json({ messaage: 'Leave Request is not valid' });
		}

		const startDateCalc = new Date(item?.startDate);
		const endDayCalc = new Date(item?.endDate);

		item.status = status;
		item.isActive = false;
		const saved = await item.save();

		const leaveStatus = status == 'rejected' ? 'Not Approved' : 'Approved';

		sendMail({
			to: item?.employee?.email,
			subject: `Leave Request ${leaveStatus}`,
			body: `Hi ${item?.employee?.name},\n
Your leave Request was ${leaveStatus}
Type of Leave: ${item?.leaveType}\n
Start Date: ${startDateCalc}\n
End Date: ${endDayCalc}\n
Status: ${status}\n
`,
		});

		return res.status(200).json(saved);
	} catch (error) {
		console.log(error);
		return res.status(500).json({ message: 'Error' });
	}
};

export default updateLeave;
