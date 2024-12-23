import nodemailer from 'nodemailer';

type SendMailProps = {
	to: string;
	subject: string;
	body: string;
	title?: string;
};

const sendMail = async ({ to, subject, body, title }: SendMailProps) => {
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

		var mailOptions: any = {
			from: `${title || 'MINT'} <${process.env.MAIL_ADDRESS}>`,
			to: to,
			subject: subject,
			text: body,
		};

		transporter.sendMail(mailOptions, function (error, info) {
			if (error) {
				console.log('Error Sending Mail' + error);
			} else {
				console.log('Email sent: ' + info.response);
			}
		});
	} catch (e) {
		console.log('Error Sending Mail');
	}
};

export default sendMail;
