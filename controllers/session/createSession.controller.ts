import { Request, Response } from 'express';
import Session from '../../models/session/session.model.js';
import User from '../../models/user/user.model.js';
import bcrypt from 'bcrypt';
import sendMail from '../mail/sendMail.controller.js';

const createSession = async (req: Request, res: Response) => {
	const { password, code, email } = req.body;

	try {
		const employee = await User.findOne({
			$or: [{ email: email }, { id: email }, { phone: email }],
		});

		if (!employee) {
			return res.status(400).json({ message: 'User not found' });
		}

		const validPassword = await bcrypt.compare(password, employee.password);

		if (!validPassword)
			return res.status(400).json({ status: 'error', message: 'Incorrect password' });

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const now = new Date();
		const checkInTime = now.getHours();
		const getMinutes = now.getMinutes();

		const ifExist = await Session.findOne({ date: today, employee: employee._id }).populate(
			'employee'
		);

		if (ifExist) {
			return res.status(400).json({ message: 'You have already registered a session for today' });
		}

		const session = new Session({
			employee,
			//code,
			date: today,
			start: now,
			status: 'active',
			hours: 0,
			isActive: true,
		});

		if (checkInTime > 13) {
			return res.status(400).json({ message: 'Check In not allowed after 1PM' });
		}

		if (checkInTime >= 10 && checkInTime < 11) session.lateCheckIn = true;
		if (checkInTime >= 11) session.halfDay = true;

		const saved = await session.save();

		sendMail({
			to: `${employee?.email}`,
			subject: 'Attendance Registered',
			body: `Hello ${employee?.name}, your attendance has been registered for today at ${checkInTime
				.toString()
				.padStart(2, '0')}:${getMinutes.toString().padStart(2, '0')}`,
		});

		sendMail({
			to: `asifistiaque.ai@gmail.com`,
			subject: `New Check In Alert: ${employee?.name}`,
			body: `${employee?.name} has checked in today at ${checkInTime
				.toString()
				.padStart(2, '0')}:${getMinutes.toString().padStart(2, '0')}`,
		});

		return res.status(200).json(saved);
	} catch (error) {
		console.log(error);
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};

export default createSession;
