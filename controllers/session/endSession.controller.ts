import { Request, Response } from 'express';
import Session from '../../models/session/session.model.js';
import User from '../../models/user/user.model.js';
import bcrypt from 'bcrypt';
import sendMail from '../mail/sendMail.controller.js';

const endSession = async (req: Request, res: Response) => {
	const { password, code, email } = req.body;

	try {
		const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

		if (ip != '45.248.149.63') {
			return res.status(400).json({ message: 'You can not register from this ip address' });
		}

		const employee = await User.findOne({
			$or: [{ email: email }, { id: email }, { phone: email }],
		});

		if (!employee) {
			return res.status(400).json({ error: 'User not found' });
		}

		const validPassword = await bcrypt.compare(password, employee.password);

		if (!validPassword)
			return res.status(400).json({ status: 'error', message: 'Incorrect password' });

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const now = new Date();
		const checkOutTime = now.getHours();
		const getMinutes = now.getMinutes();

		const ifExist = await Session.findOne({ date: today, employee });

		if (!ifExist) {
			return res.status(400).json({ message: 'This session does not exist' });
		}

		if (!ifExist.isActive) {
			return res.status(400).json({ message: 'This session has already ended' });
		}

		const end: any = new Date();
		ifExist.end = end;

		const diff: any = end - ifExist.start;
		const totalHours = diff / 1000 / 60 / 60;

		ifExist.hours = totalHours.toFixed(2);
		ifExist.isActive = false;

		if (totalHours < 5) {
			ifExist.status = 'half-day';
			ifExist.halfDay = true;
		} else if (totalHours < 8) {
			ifExist.status = 'late/early';
			ifExist.earlyCheckOut = true;
		} else if (totalHours >= 8) {
			ifExist.status = 'completed';
		}

		const saved = await ifExist.save();

		sendMail({
			to: `${employee?.email}`,
			subject: 'Session Ended',
			body: `Hello ${employee?.name}, your session has been ended for today at ${checkOutTime
				.toString()
				.padStart(2, '0')}:${getMinutes.toString().padStart(2, '0')}`,
		});

		sendMail({
			to: `hr.thinkcrypt@gmail.com`,
			subject: `New Check Out Alert: ${employee?.name}`,
			body: `${employee?.name} has checked out today at ${checkOutTime
				.toString()
				.padStart(2, '0')}:${getMinutes.toString().padStart(2, '0')}. Check In Time was: ${
				ifExist.start
			} Total Hours Completed: ${totalHours.toFixed(2)}. Status: ${ifExist.status}`,
		});

		return res.status(200).json(saved);
	} catch (error) {
		console.log(error);
		return res.status(500).json({ error: 'Internal Server Error' });
	}
};

export default endSession;
