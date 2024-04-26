import { Request, Response } from 'express';
import User from '../../models/user/user.model.js';
import sendMail from '../mail/sendMail.controller.js';
import Leave, { settings } from '../../models/leave/leave.model.js';
import generateTrackingId from '../../lib/functions/generateTrackingId.js';
import generateLeaveMessage from '../../lib/functions/generateLeaveMessage.js';
import leaveConditions from '../../lib/functions/leaveConditions.js';

const createLeave = async (req: Request, res: Response) => {
	const { employee: email, leaveType, reason, startDate, endDate } = req.body;

	try {
		const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

		const startDateCalc = new Date(startDate);
		const endDayCalc = new Date(endDate);

		if (startDateCalc > endDayCalc) {
			return res.status(400).json({ message: 'Start date should not be greater than end date' });
		}

		const diffTime = Math.abs(endDayCalc.getTime() - startDateCalc.getTime());
		const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

		const employee = await User.findOne({
			$or: [{ email: email }, { id: email }, { phone: email }],
		});

		if (!employee) return res.status(400).json({ message: 'User not found' });

		const {
			status,
			subject,
			reasonOfRejection = '',
		} = await leaveConditions({
			startDate,
			endDate,
			id: employee._id,
			leaveType,
			ip,
			days,
		});

		const trackingId = generateTrackingId(4);

		const leave = new Leave({
			employee: employee._id,
			leaveType,
			reason,
			startDate,
			endDate,
			days,
			trackingId,
			isActive: true,
			status,
		});

		const saved = await leave.save();

		const message: string = generateLeaveMessage({
			name: employee.name,
			status,
			trackingId,
			reason: reasonOfRejection,
		});

		sendMail({
			to: `${employee?.email}`,
			subject: `${subject} - ${trackingId}`,
			body: message,
		});

		sendMail({
			to: `asifistiaque.ai@gmail.com`,
			subject: `New Leave Request from: ${employee?.name} - ${trackingId}`,
			body: `${employee?.name} has submitted a leave request,\n
Type of Leave: ${leaveType}\n
Start Date: ${startDateCalc}\n
End Date: ${endDayCalc}\n
Reason: ${reason}\n
Tracking ID: ${trackingId}\n
Status: ${status}\n
System Message: ${reasonOfRejection}\n
                    `,
		});

		return res.status(200).json(saved);
	} catch (error) {
		console.log(error);
		return res.status(500).json({ message: 'Error' });
	}
};

export default createLeave;
