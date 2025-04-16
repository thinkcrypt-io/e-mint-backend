import jwt from 'jsonwebtoken';
import Customer from '../../models/customer/customer.model.js';
import nodemailer from 'nodemailer';

const requestPasswordChange = async (req: any, res: any) => {
	const { email } = req.body;
	try {
		let data = await Customer.findOne({ email }).select('-password');
		if (!data) return res.status(404).json({ message: 'User Not Found' });

		const token = jwt.sign(
			{
				_id: data._id,
				email: data.email,
			},
			process.env.JWT_PRIVATE_KEY || 'myprivatekey',
			{
				expiresIn: '1h',
			}
		);

		sendResetPasswordMail(token, data?.name, email);

		return res.status(200).json({
			message: 'Email Sent',
			url: `${process.env.WEBSITE}/auth/forget-password/set-password?token=${token}`,
		});
	} catch (e: any) {
		console.log(e.message);
		return res.status(500).json({ message: e.message });
	}
};
export default requestPasswordChange;

const sendResetPasswordMail = async (
	token: string,
	name: string,
	email: string
) => {
	try {
		var transporter = nodemailer.createTransport({
			host: process.env.MAIL_HOST,
			port: 587,
			secure: false,
			auth: {
				user: process.env.MAIL_ADDRESS,
				pass: process.env.MAIL_PASSWORD,
			},
		});

		var mailOptions = {
			from: `HINT <${process.env.MAIL_ADDRESS}>`,
			to: email,
			subject: 'Reset Password',
			// text: 'Please follow this link to reset your password, this link is only valid for 3 minutes.',
			html: `
				<div>
					<p>Dear ${name},</p>
					<p>We received a request to reset the password for your account associated with this email address. If you did not make this request, please ignore this email.</p>
					<p>To reset your password, please click on the link below:</p>
					<p><a href="${process.env.WEBSITE}/auth/forget-password/set-password?token=${token}">Reset Password Link</a></p>
					<p>This link will expire in 1 hour for security reasons. If the link expires, you can request a new password reset link through our website.</p>
					<p>Thank you</p>
				</div>	
			`,
		};

		transporter.sendMail(mailOptions, function (error, info) {
			if (error) {
				console.log(error);
			} else {
				console.log('Email sent: ' + info.response);
			}
		});
	} catch (e: any) {
		console.log('Error', e);
	}
};
